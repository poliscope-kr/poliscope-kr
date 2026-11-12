// 열린재정(기획재정부) 공개 API: 총사업비 관리 대상 사업과 세부사업 예산 중
// '지금 추진 중인 비슷한 사업'(공항·철도·경기장 등)에 해당하는 것만 골라 저장한다. 평가는 하지 않는다.
import { writeFileSync } from 'node:fs';
const KEY = (process.env.OPENFISCAL_KEY || '').trim(), BASE = 'https://openapi.openfiscaldata.go.kr', OUT = process.env.OUT_DIR || 'docs/data';
if (!KEY) { console.log('OPENFISCAL_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
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
// 같은 유형(새 공항, 도시철도·경전철) 건설 사업만: 단위사업 이름으로 고른다.
const GROUPS = [['air', '새 공항 건설', /^신공항건설$/], ['rail', '도시철도·경전철 건설', /^(지하철건설지원|경량전철건설지원|광역철도건설지원)$/]];
const year = new Date().getFullYear(), byYear = {};
for (const y of [year + 1, year, year - 1]) {
  const rows = await all('ExpenditureBudgetInit5', { FSCL_YY: y }, 40);
  console.log('세부사업 예산', y, rows.length);
  if (rows.length) byYear[y] = rows;
  if (Object.keys(byYear).length === 2) break;
}
const ys = Object.keys(byYear).map(Number).sort((a, b) => b - a), Y = ys[0], P = ys[1];
const amt = r => Math.round(Number(r.Y_YY_DFN_MEDI_KCUR_AMT ?? r.Y_YY_MEDI_KCUR_AMT ?? 0) / 100000); // 천원 → 억원
const pick = (rows, re) => (rows || []).filter(r => re.test(r.ACTV_NM || '') && !/추진단|공단|운영|노후|증차/.test(r.SACTV_NM || ''));
const items = [];
for (const [g, , re] of GROUPS) {
  const prev = Object.fromEntries(pick(byYear[P], re).map(r => [r.SACTV_NM, amt(r)]));
  for (const r of pick(byYear[Y], re)) items.push({ g, n: r.SACTV_NM, o: r.OFFC_NM, a: amt(r), p: prev[r.SACTV_NM] ?? null });
}
items.sort((a, b) => b.a - a.a);
writeFileSync(`${OUT}/fiscal.json`, JSON.stringify({ updated: new Date().toISOString(), y: Y, py: P || null, groups: Object.fromEntries(GROUPS.map(([k, n]) => [k, n])), items, src: '열린재정 세부사업 예산편성현황(ExpenditureBudgetInit5)' }));
console.log('저장', Y, P, items.length, JSON.stringify(items.slice(0, 5)));
