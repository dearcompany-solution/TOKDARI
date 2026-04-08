// api/chat.js
export default async function handler(req, res) {
  // Vercel 환경 변수에서 안전하게 키를 가져옵니다.
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(req.body)
  });

  const data = await response.json();
  res.status(200).json(data);
}
