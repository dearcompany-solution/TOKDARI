const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// VAPID 서명 생성 (web-push 없이 직접 구현)
async function sendPushNotification(subscription, payload) {
  const webpush = await import('web-push').catch(() => null);
  if (!webpush) throw new Error('web-push 없음');

  webpush.default.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  await webpush.default.sendNotification(subscription, JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, title, body } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId 필요' });

  try {
    const { data: subs } = await sb.from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subs?.length) return res.status(200).json({ ok: true, sent: 0 });

    let sent = 0;
    for (const row of subs) {
      try {
        await sendPushNotification(row.subscription, {
          title: title || '톡다리',
          body: body || '야 어디있어?',
          icon: '/icon.png',
          badge: '/icon.png'
        });
        sent++;
      } catch(e) {
        if (e.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    }
    return res.status(200).json({ ok: true, sent });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
