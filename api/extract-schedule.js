export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { text, today } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `오늘 날짜: ${today}
대화에서 일정/약속/마감/할일을 추출해. JSON만 반환해. 없으면 {"schedules":[]} 반환.
confidence는 날짜가 명확하면 "high", 불확실하면 "low"로 설정해.
형식:
{"schedules":[{"title":"일정 제목","date":"YYYY-MM-DD 또는 null","confidence":"high 또는 low"}]}`
          },
          { role: 'user', content: text }
        ],
        max_tokens: 300,
        temperature: 0.3
      })
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{"schedules":[]}';
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({ schedules: [] });
    }
  } catch(e) {
    return res.status(500).json({ schedules: [] });
  }
}
