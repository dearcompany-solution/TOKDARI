const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// 링크 접근 가능 여부 체크 (타임아웃 2초로 단축)
async function isLinkAccessible(url){
  try{
    const resp=await fetch(url,{
      method:'HEAD',
      timeout:2000,
      headers:{'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'}
    });
    return resp.status<400;
  }catch(e){return false;}
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 필요' });
  }

  try {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';

    const isExpertMode = /척척박사|뉴스박사|건강박사|경제박사/.test(systemMsg);
    const noSearchNeeded = !isExpertMode && /힘들어|피곤|슬퍼|기뻐|화나|보고싶|사랑|ㅋㅋ|ㅠㅠ|밥|잠|자야|놀자|심심/.test(lastUserMsg);
    const needsSearch = isExpertMode || (
      !noSearchNeeded &&
      lastUserMsg.length > 8 &&
      /뭐야|뭔데|어때|알아|언제|어디|누구|얼마|몇|어떻게|왜|뉴스|최신|요즘|트렌드|연예|스포츠|주가|날씨|기온|온도|습도|비|눈|정보|알려줘|찾아봐|검색|개봉|출시|발표|순위|결과/.test(lastUserMsg)
    );
    const needsImage = /사진|이미지|그림|보여줘|어떻게생겼|어떻게 생겼/.test(lastUserMsg);
    const searchCount = isExpertMode ? 5 : 3;

    const BLOCKED = [
      'chosun.com','joongang.co.kr','donga.com','hani.co.kr','kmib.co.kr',
      'munhwa.com','segye.com','sedaily.com','hankyung.com','mk.co.kr',
      'economist.com','wsj.com','ft.com','nytimes.com','bloomberg.com',
      'thetimes.co.uk','telegraph.co.uk','joins.com','heraldcorp.com',
      'biz.chosun.com','news.chosun.com'
    ];

    const PREFERRED = [
      'yna.co.kr','yonhapnews.co.kr','kbs.co.kr','mbc.co.kr','sbs.co.kr',
      'jtbc.co.kr','ytn.co.kr','newsis.com','news1.kr','ohmynews.com',
      'naver.com','daum.net','wikipedia.org','namu.wiki'
    ];

    let searchContext = '';
    let imageContext = '';

    if (needsSearch && process.env.BRAVE_API_KEY) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const searchResp = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(lastUserMsg)}&count=10&search_lang=ko&country=KR&freshness=pw`,
          {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': process.env.BRAVE_API_KEY
            }
          }
        );
        const searchData = await searchResp.json();
        const rawResults = searchData.web?.results || [];

        // 1차: 차단 도메인 필터
        const filtered = rawResults.filter(r => {
          if (!r.url || !r.url.startsWith('http')) return false;
          return !BLOCKED.some(b => r.url.includes(b));
        });

        // 2차: 우선 사이트 정렬
        const sorted = [
          ...filtered.filter(r => PREFERRED.some(p => r.url.includes(p))),
          ...filtered.filter(r => !PREFERRED.some(p => r.url.includes(p)))
        ];

        // 3차: 상위 8개 병렬로 동시에 접근 체크 (타임아웃 2초)
        const candidates = sorted.slice(0, 8);
        const accessChecks = await Promise.all(
          candidates.map(async r => {
            const ok = await isLinkAccessible(r.url);
            return ok ? r : null;
          })
        );

        // 살아있는 링크만 추출
        const validResults = accessChecks
          .filter(Boolean)
          .slice(0, searchCount);

        if (validResults.length > 0) {
          const results = validResults
            .map((r,i) => `[${i+1}] 제목: ${r.title}\n내용: ${r.description || '(설명 없음)'}\nURL: ${r.url}${r.age ? '\n날짜: '+r.age : ''}`)
            .join('\n\n');
          searchContext = `\n\n====실시간검색결과(${today})=====\n${results}\n====여기까지====\n\n[검색 결과 사용 규칙]\n1. 반드시 위 검색 결과 내용만 인용해서 답해. 학습 데이터로 추측하지 마.\n2. URL은 글자 하나도 바꾸지 말고 그대로 줘. (위 URL은 실제 접근 확인된 링크야)\n3. 검색 결과에 없는 내용 물어보면 "검색해봤는데 못 찾겠어"라고 솔직하게 말해.\n4. 날짜 있으면 날짜도 같이 알려줘.\n5. 반말로 짧게 핵심만 전달해.`;
        } else {
          // 살아있는 링크 없으면 내용만 요약 전달
          const fallback = sorted.slice(0, searchCount);
          if (fallback.length > 0) {
            const results = fallback
              .map((r,i) => `[${i+1}] 제목: ${r.title}\n내용: ${r.description || '(설명 없음)'}${r.age ? '\n날짜: '+r.age : ''}`)
              .join('\n\n');
            searchContext = `\n\n====실시간검색결과(${today})=====\n${results}\n====여기까지====\n\n[주의] 링크 접근이 불안정해. URL은 주지 말고 내용만 요약해서 전달해. 출처 이름(KBS, 연합뉴스 등)은 언급해도 돼.`;
          } else {
            searchContext = `\n\n[검색 결과 없음] 검색했는데 결과가 없어. "검색해봤는데 못 찾겠어"라고 말하고 알고 있는 정보로만 답해.`;
          }
        }
      } catch(e) {
        searchContext = `\n\n[검색 실패] 알고 있는 정보로만 답해줘.`;
      }
    }

    // 이미지 검색 (접근 체크 포함)
    if (needsImage && process.env.BRAVE_API_KEY) {
      try {
        const imgResp = await fetch(
          `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(lastUserMsg)}&count=5`,
          {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': process.env.BRAVE_API_KEY
            }
          }
        );
        const imgData = await imgResp.json();
        const imgCandidates = imgData.results?.slice(0,5).filter(r=>r.url?.startsWith('http')) || [];

        // 이미지도 병렬 접근 체크
        const imgChecks = await Promise.all(
          imgCandidates.map(async r => {
            const ok = await isLinkAccessible(r.url);
            return ok ? r : null;
          })
        );
        const validImgs = imgChecks.filter(Boolean).slice(0, 3);

        if (validImgs.length > 0) {
          imageContext = `\n\n[이미지 검색 결과 - 접근 확인된 이미지]\n${validImgs.map(r=>`이미지: ${r.url}`).join('\n')}\nURL 그대로 전달해줘.`;
        }
      } catch(e) {}
    }

    const messagesWithSearch = messages.map(m => {
      if (m.role === 'system' && (searchContext || imageContext)) {
        return { ...m, content: m.content + searchContext + imageContext };
      }
      return m;
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messagesWithSearch,
        max_tokens: 300,
        temperature: 0.85,
        presence_penalty: 0.5,
        frequency_penalty: 0.5
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || '오류' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
