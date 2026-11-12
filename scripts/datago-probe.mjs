// 지방재정365 링크형 API의 실제 주소 확인
for (const id of ['15138721', '15138701']) {
  const html = await (await fetch(`https://www.data.go.kr/data/${id}/openapi.do`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  console.log('==', id, [...new Set(html.match(/https?:\/\/[a-z0-9.]*lofin[^"'\s<>]*/gi) || [])].slice(0, 10));
}
for (const u of ['https://www.lofin365.go.kr/portal/LF5112.do', 'https://lofin365.go.kr/lf/hub/AJEFC?Type=json&pIndex=1&pSize=1']) {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); const t = await r.text(); console.log('시험', u, r.status, t.replace(/\s+/g, ' ').slice(0, 400)); } catch (e) { console.log('실패', u, e.message); }
}
