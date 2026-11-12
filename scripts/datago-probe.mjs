const K = (process.env.KOSIS_KEY || '').trim(); console.log('KOSIS_KEY 길이', K.length);
for (const q of ['고용률', '노인 상대적 빈곤율', '교통사고 사망자', '기대수명', '미세먼지 PM2.5 연평균', '합계출산율', '5대 범죄 발생', '국가연구개발 사업 성과', '1인당 국민총소득', '온실가스 배출량']) {
  try { const r = await fetch(`https://kosis.kr/openapi/statisticsSearch.do?method=getList&apiKey=${encodeURIComponent(K)}&searchNm=${encodeURIComponent(q)}&format=json&jsonVD=Y&resultCount=6`); const j = await r.json();
    console.log('==', q, Array.isArray(j) ? j.map(x => `${x.ORG_ID}/${x.TBL_ID} ${x.TBL_NM} [${x.STRT_PRD_DE}-${x.END_PRD_DE} ${x.PRD_SE || ''}]`).join(' | ') : JSON.stringify(j).slice(0, 200)); } catch (e) { console.log(q, e.message); }
}
