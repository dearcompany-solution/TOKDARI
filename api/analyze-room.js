const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { chatroomId, userId } = req.body;
  if (!chatroomId || !userId) return res.status(400).json({ error: '필수값 누락' });

  try {
    // 최근 50개 메시지 가져오기
    const { data: msgs } = await sb.from('messages')
      .select('role, content')
      .eq('chatroom_id', chatroomId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!msgs || msgs.length < 5) return res.status(200).json({ ok: true, skipped: true });

    const conversation = msgs.reverse()
      .filter(m => typeof m.content === 'string')
      .map(m => `${m.role === 'user' ? '사용자' : '친구'}: ${m.content}`)
      .join('\n');

    // GPT로 대화 특성 분석
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `대화를 분석해서 JSON만 반환해. 다른 말 하지 마.
{
  "topics": ["주요 대화 주제 3~5개"],
  "mood": "전반적인 분위기 한 단어 (밝음/무거움/유머러스/감성적/진지함)",
  "summary": "이 사람과의 대화 특성을 한 문장으로"
}`
        }, {
          role: 'user',
          content: conversation
        }],
        max_tokens: 200,
        temperature: 0.3
      })
    });

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // room_profiles 저장 (upsert)
    await sb.from('room_profiles').upsert({
      user_id: userId,
      chatroom_id: chatroomId,
      topics: parsed.topics || [],
      mood: parsed.mood || '보통',
      summary: parsed.summary || '',
      last_analyzed: new Date().toISOString()
    }, { onConflict: 'chatroom_id' });

    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
