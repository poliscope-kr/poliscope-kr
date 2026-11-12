// 분야별 대표 결과 지표(통계청 KOSIS). 예산과 "같이 보기"용이며 인과관계를 판정하지 않는다.
import { writeFileSync } from 'node:fs';
const K = (process.env.KOSIS_KEY || '').trim();
if (!K) { console.log('KOSIS_KEY가 없어 건너뜁니다.'); process.exit(0); }
const SPEC = [
 { f: ['사회복지'], n: '노인 상대적 빈곤율(66세 이상, 처분가능소득)', u: '%', better: 'down', t: 'DT_1HDALF06', L: '&objL2=ALL', pick: x => /66세/.test(x.C1_NM) && /빈곤율/.test(x.C2_NM) && /처분/.test(x.ITM_NM) },
 { f: ['사회복지'], n: '합계출산율', u: '명', better: 'up', t: 'INH_1B81A17', L: '', pick: x => x.C1_NM === '전국' && /합계출산율/.test(x.ITM_NM) },
 { f: ['산업·중소기업및에너지', '일반·지방행정'], n: '고용률(15세 이상)', u: '%', better: 'up', t: 'INH_1DA7014S_03', L: '&objL2=ALL', pick: x => x.C1_NM === '계' && x.C2_NM === '계' },
 { f: ['교통및물류', '공공질서및안전'], n: '교통사고 사망자 수', u: '명', better: 'down', t: 'DT_2KAAD31', L: '', pick: x => x.C1_NM === '대한민국' },
 { f: ['보건'], n: '기대수명', u: '세', better: 'up', t: 'DT_2KAA209', L: '&objL2=ALL', pick: x => x.C1_NM === '대한민국' && (!x.C2_NM || /전체|계|합|Both|양성/.test(x.C2_NM)) },
 { f: ['환경'], n: '초미세먼지(PM2.5) 연평균 노출 농도', u: '㎍/㎥', better: 'down', t: 'DT_2UNS0109', L: '&objL2=ALL', pick: x => x.C1_NM === '대한민국' && x.C2_NM === '지역합계' },
 { f: ['일반·지방행정'], n: '1인당 국민총소득', u: '달러', better: 'up', t: 'DT_2AS017', L: '', pick: x => x.C1_NM === '대한민국' },
];
const now = new Date().getFullYear(), out = [];
for (const s of SPEC) {
  const u = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${encodeURIComponent(K)}&itmId=ALL&objL1=ALL${s.L}&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=14&orgId=101&tblId=${s.t}`;
  try {
    const j = await (await fetch(u, { signal: AbortSignal.timeout(60000) })).json();
    if (!Array.isArray(j)) { console.log(s.n, JSON.stringify(j).slice(0, 150)); continue; }
    const rows = j.filter(s.pick).filter(x => +x.PRD_DE < now && x.DT !== '-' && x.DT !== '');
    const by = {}; rows.forEach(x => { by[x.PRD_DE] = by[x.PRD_DE] ?? Number(x.DT); });
    const ser = Object.entries(by).sort().map(([y, v]) => [y, Math.round(v * 100) / 100]);
    console.log(s.n, ser.length, JSON.stringify(ser.slice(-4)), rows[0] ? `${rows[0].ITM_NM}/${rows[0].C1_NM}/${rows[0].C2_NM || ''}` : '');
    if (!ser.length) console.log('  예시', JSON.stringify(j.filter(x => x.C1_NM === '대한민국').slice(0, 3).map(x => [x.ITM_NM, x.C2_NM, x.C3_NM, x.PRD_DE, x.DT])), j.length, j[0]?.C1_NM);
    if (ser.length) out.push({ f: s.f, n: s.n, u: s.u, better: s.better, tbl: `${j[0].TBL_NM}(${s.t})`, s: ser.slice(-12) });
  } catch (e) { console.log(s.n, e.message); }
}
writeFileSync('docs/data/indicators.json', JSON.stringify({ updated: new Date().toISOString(), src: '통계청 국가통계포털(KOSIS)', list: out }));
