const K = (process.env.KOSIS_KEY || '').trim();
const T = [['101', 'INH_1DA7014S_03'], ['101', 'DT_1HDALF06'], ['101', 'DT_2OEHG001'], ['101', 'DT_2UNS0109']];
for (const [o, t] of T) for (const L of ['&objL2=ALL', '&objL2=ALL&objL3=ALL', '&objL2=ALL&objL3=ALL&objL4=ALL']) {
  const u = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${encodeURIComponent(K)}&itmId=ALL&objL1=ALL${L}&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=1&orgId=${o}&tblId=${t}`;
  try { const j = await (await fetch(u)).json(); if (!Array.isArray(j)) { console.log('--', t, L, j.errMsg); continue; }
    const uniq = k => [...new Set(j.map(x => x[k]).filter(Boolean))];
    console.log('==', t, j[0]?.TBL_NM, L, '행', j.length, '항목', uniq('ITM_NM').slice(0, 10).join('/'), '| C1', uniq('C1_NM').slice(0, 10).join('/'), '| C2', uniq('C2_NM').slice(0, 12).join('/'), '| C3', uniq('C3_NM').slice(0, 8).join('/'), '| 기간', uniq('PRD_DE').join(','));
    break;
  } catch (e) { console.log(t, e.message); }
}
