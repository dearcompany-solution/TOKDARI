const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const webpush = require('web-push');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: '인증 실패' });
  }

  try {
    // 푸시 구독 유저 전체 가져오기
    const { data: subs } = await sb.from('push_subscriptions').select('user_id, subscription');
    if (!subs?.length) return res.status(200).json({ ok: true, sent: 0 });

    let totalSent = 0;

    for (const sub of subs) {
      try {
        // 해당 유저 최근 대화 가져오기
        const { data: recentMsgs } = await sb.from('messages')
          .select('content, role')
          .eq('user_id', sub.user_id)
          .order('created_at', { ascending: false })
          .limit(10);

        // 캐릭터 정보 가져오기
        const { data: charData } = await sb.from('user_characters')
          .select('char_id, char_name')
          .eq('user_id', sub.user_id)
          .single();

        const charName = charData?.char_name || '친구';
        const charId = charData?.char_id || 'A';

        // 최근 대화 내용 요약해서 선톡 생성
        const recentContext = recentMsgs?.length
          ? recentMsgs.reverse().map(m => `${m.role === 'user' ? '사용자' : charName}: ${m.content}`).join('\n').slice(0, 500)
          : '';

        const charStyle = {
          A: '활발하고 유머러스하게, 반말로. ㅋㅋ 자주 씀',
          B: '다정하지만 짧게, 반말로',
          C: '직설적이고 가끔 퉁명스럽게, 반말로'
        }[charId] || '친근하게 반말로';

        // GPT로 맞춤 선톡 생성
        const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'system',
              content: `너는 ${charName}이야. ${charStyle}.
먼저 짧게 선톡 보내줘. 10~20글자 이내. 반말로.
${recentContext ? `최근 대화 내용:\n${recentContext}\n이 내용 참고해서 자연스럽게 이어지는 선톡 보내줘.` : '일상적인 안부나 재밌는 선톡 보내줘.'}
예시: "야 뭐해", "생각났어", "오늘 어때", "나 심심한데", "밥은 먹었어"
한 줄로만 답해.`
            }],
            max_tokens: 50,
            temperature: 1.2
          })
        });

        const gptData = await gptResp.json();
        const pingMsg = gptData.choices?.[0]?.message?.content?.trim() || '야 뭐해';

        // 푸시 알림 발송
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            title: charName,
            body: pingMsg,
            icon: '/icon.png',
            badge: '/icon.png'
          })
        );

        // 메시지 DB에도 저장 (나중에 채팅창 열면 보이게)
        await sb.from('messages').insert({
          user_id: sub.user_id,
          role: 'assistant',
          content: pingMsg,
          created_at: new Date().toISOString()
        });

        totalSent++;
      } catch(e) {
        if (e.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
        }
      }
    }

    return res.status(200).json({ ok: true, sent: totalSent });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
