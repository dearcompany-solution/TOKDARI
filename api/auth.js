import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, password, name, username } = req.body;

  // ── 회원가입 ──
  if (action === 'signup') {
    // 이메일 중복 체크
    const { data: existing } = await sb.from('profiles')
      .select('id').eq('username', username).maybeSingle();
    if (existing) return res.status(400).json({ error: '이미 사용 중인 아이디야!' });

    // Supabase Auth 유저 생성 (비번 자동 암호화)
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authErr) return res.status(400).json({ error: authErr.message });

    // profiles 테이블에 저장
    const { error: profileErr } = await sb.from('profiles').insert({
      auth_id: authData.user.id,
      username,
      name,
      email,
      friend_name: '지수',
      friend_nickname: '친구야',
      avatar: '👦 찐친남사친',
      talk_style: '친구같이 편하고 솔직하게, 반말로',
      roles: ['감정 쓰레기통', '개인비서']
    });
    if (profileErr) {
      // 프로필 저장 실패 시 auth 유저도 삭제
      await sb.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileErr.message });
    }

    return res.status(200).json({ ok: true });
  }

  // ── 로그인 ──
  if (action === 'login') {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸어!' });

    const { data: profile } = await sb.from('profiles')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    if (!profile) return res.status(404).json({ error: '프로필을 찾을 수 없어!' });

    return res.status(200).json({
      ok: true,
      token: data.session.access_token,
      profile
    });
  }

  return res.status(400).json({ error: '잘못된 요청' });
}
