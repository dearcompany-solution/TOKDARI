const fetch=(...args)=>import('node-fetch').then(({default:f})=>f(...args));

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).end();

  const{messages,date,userName}=req.body;
  if(!messages?.length)return res.status(400).json({error:'메시지 없음'});

  // user/assistant 대화만 정리
  const conv=messages
    .filter(m=>m.role==='user'||m.role==='assistant')
    .map(m=>`${m.role==='user'?(userName||'나'):'다리'}: ${m.content}`)
    .join('\n');

  try{
    const resp=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
      body: JSON.stringify({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: `너는 일기 작성 도우미야.
아래 대화 내용을 읽고, 사용자(${userName})가 직접 쓴 일기처럼 자연스럽게 작성해줘.

[작성 규칙]
- 1인칭으로. "나는", "오늘" 으로 시작
- 말투: 편하고 솔직한 일상 일기체 (예: "오늘은 좀 별로였다", "생각보다 괜찮았어", "그냥 그런 하루")
- 대화에서 나온 감정, 있었던 일, 느낀 점 중심으로 요약
- AI 친구 "다리"와 나눈 대화 내용은 "다리한테 ~얘기했다" 식으로 자연스럽게 녹여
- 3~5문장으로 간결하게
- 형식적이거나 보고서 느낌 절대 금지
- 느낌표 남발 금지. 담백하게

[출력 형식 - JSON만 출력, 다른 말 하지 마]
{
  "mood": "(오늘 감정을 대표하는 이모지 1개)",
  "highlight": "(오늘 핵심 한 줄 - 10자 이내)",
  "summary": "(일기 본문 3~5문장)"
}

[대화 날짜]
${date}` },
    { role: 'user', content: `대화 내용:\n${messages.map(m => `${m.role === 'user' ? '나' : '다리'}: ${m.content}`).join('\n')}` }
  ],
      })
    });

    const data=await resp.json();
    const raw=data.choices?.[0]?.message?.content?.trim()||'{}';
    const clean=raw.replace(/```json|```/g,'').trim();
    const result=JSON.parse(clean);
    return res.status(200).json(result);
  }catch(e){
    return res.status(500).json({error:e.message});
  }
};
