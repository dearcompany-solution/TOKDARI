// api/chat.js
export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요해' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았어' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 500,
        temperature: 0.9,       // 자연스러운 대화를 위해 높게
        presence_penalty: 0.6,  // 같은 말 반복 방지
        frequency_penalty: 0.3
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('OpenAI error:', errData);
      return res.status(response.status).json({ 
        error: errData.error?.message || 'OpenAI 호출 실패' 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: '서버 오류: ' + e.message });
  }
}
