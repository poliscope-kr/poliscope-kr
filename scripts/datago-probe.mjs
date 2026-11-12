for (const u of ['https://kosis.kr/openapi/statisticsSearch.do?method=getList&apiKey=x&searchNm=고용률&format=json&jsonVD=Y', 'https://www.index.go.kr/']) {
  try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); console.log('시험', u.slice(0, 50), r.status, (await r.text()).slice(0, 200)); } catch (e) { console.log('실패', u.slice(0, 50), e.cause?.code || e.message); }
}
