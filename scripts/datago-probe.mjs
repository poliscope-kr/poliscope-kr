const K = (process.env.KOSIS_KEY || '').trim();
const T = [['101', 'INH_1DA7014S_03'], ['101', 'DT_1HDALF06'], ['101', 'DT_2KAAD31'], ['101', 'DT_2OEHG001'], ['101', 'DT_2UNS0109'], ['101', 'INH_1B81A17'], ['101', 'DT_2AS017']];
for (const [o, t] of T) {
  const u = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${encodeURIComponent(K)}&itmId=ALL&objL1=ALL&objL2=&objL3=&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=3&orgId=${o}&tblId=${t}`;
  try { const j = await (await fetch(u)).json(); if (!Array.isArray(j)) { console.log('==', t, JSON.stringify(j).slice(0, 200)); continue; }
    const items = [...new Set(j.map(x => x.ITM_NM))], c1 = [...new Set(j.map(x => x.C1_NM))];
    console.log('==', t, j[0]?.TBL_NM, '행', j.length, '항목', items.slice(0, 12).join('/'), '| 분류', c1.slice(0, 15).join('/'), '| 예', JSON.stringify(j.find(x => /한국|대한민국|전국|계/.test(x.C1_NM || '')) || j[0]).slice(0, 300));
  } catch (e) { console.log(t, e.message); }
}
