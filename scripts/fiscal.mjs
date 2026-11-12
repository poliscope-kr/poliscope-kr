// 열린재정(기획재정부) 공개 API: 총사업비 관리 대상 사업과 세부사업 예산 중
// '지금 추진 중인 비슷한 사업'(공항·철도·경기장 등)에 해당하는 것만 골라 저장한다. 평가는 하지 않는다.
import { writeFileSync, readFileSync } from 'node:fs';
const KEY = (process.env.OPENFISCAL_KEY || '').trim(), BASE = 'https://openapi.openfiscaldata.go.kr', OUT = process.env.OUT_DIR || 'docs/data';
if (!KEY) { console.log('OPENFISCAL_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORDS = /공항|경전철|도시철도|신공항|트램|모노레일|케이블카|출렁다리|경기장|서킷|리조트|테마파크|박람회|엑스포|운하|뱃길/;
async function call(code, params, p = 1) {
  const qs = new URLSearchParams({ KEY, Type: 'json', pIndex: p, pSize: 1000, ...params });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}/${code}?${qs}`, { signal: AbortSignal.timeout(60000) });
      let j = await r.text(); j = JSON.parse(j); if (typeof j === 'string') j = JSON.parse(j);
      if (!j[code]) { console.log(code, '응답:', JSON.stringify(j).slice(0, 300)); return null; }
      const [hd, rows] = j[code], res = hd.head[1]?.RESULT;
      if (res && res.CODE !== 'INFO-000') { console.log(code, res.CODE, res.MESSAGE); return null; }
      return { total: Number(hd.head[0].list_total_count), rows: rows?.row || [] };
    } catch (e) { console.log(code, '재시도', e.message); await wait(3000 * (i + 1)); }
  }
  return null;
}
async function all(code, params, max = 30) {
  const out = []; for (let p = 1; p <= max; p++) { const r = await call(code, params, p); if (!r) break; out.push(...r.rows); if (!r.rows.length || out.length >= r.total) break; await wait(300); }
  return out;
}
const year = new Date().getFullYear(), res = { updated: new Date().toISOString(), totalCost: [], budget: [], cols: {} };
// 1) 총사업비 관리 대상 사업(대형 공사·정보화 사업, 총사업비 변경 이력 포함)
for (const y of [year, year - 1]) {
  const rows = await all('TotalProjectCost', { FSCL_YY: y });
  console.log('총사업비현황', y, rows.length);
  if (rows.length) { res.cols.totalCost = Object.keys(rows[0]); res.totalCost = rows.filter(r => WORDS.test(Object.values(r).join(' '))).map(r => ({ y, ...r })); res.tcYear = y; break; }
}
// 2) 올해 세부사업 예산 중 같은 유형
for (const y of [year, year - 1]) {
  const rows = await all('ExpenditureBudgetInit5', { FSCL_YY: y }, 40);
  console.log('세부사업 예산', y, rows.length);
  if (rows.length) { res.cols.budget = Object.keys(rows[0]); res.budget = rows.filter(r => WORDS.test(`${r.SACTV_NM || ''} ${r.ACTV_NM || ''}`)).map(r => ({ y, ...r })); res.bYear = y; break; }
}
console.log('열 이름', JSON.stringify(res.cols));
console.log('골라낸 사업: 총사업비', res.totalCost.length, '· 세부사업', res.budget.length);
console.log('예시', JSON.stringify(res.totalCost.slice(0, 2)).slice(0, 800), JSON.stringify(res.budget.slice(0, 2)).slice(0, 800));
writeFileSync(`${OUT}/fiscal.json`, JSON.stringify(res));
