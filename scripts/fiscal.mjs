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
const val = r => { const d = Number(r.Y_YY_DFN_MEDI_KCUR_AMT || 0), m = Number(r.Y_YY_MEDI_KCUR_AMT || 0); return d > 0 ? [d, 'final'] : [m, 'draft']; };
for (const y of [year + 1, year, year - 1]) {
  const rows = await all('ExpenditureBudgetInit5', { FSCL_YY: y }, 40);
  const pos = rows.filter(r => val(r)[0] > 0).length;
  console.log('세부사업 예산', y, rows.length, '금액 있는 행', pos);
  if (pos > 100) byYear[y] = rows;
  if (Object.keys(byYear).length === 2) break;
}
const ys = Object.keys(byYear).map(Number).sort((a, b) => b - a), Y = ys[0], P = ys[1];
const amt = r => Math.round(val(r)[0] / 100000); // 천원 → 억원
const kind = (byYear[Y] || []).some(r => Number(r.Y_YY_DFN_MEDI_KCUR_AMT || 0) > 0) ? 'final' : 'draft';
const pick = (rows, re) => (rows || []).filter(r => re.test(r.ACTV_NM || '') && !/추진단|공단|운영|노후|증차/.test(r.SACTV_NM || ''));
const items = [];
for (const [g, , re] of GROUPS) {
  const prev = Object.fromEntries(pick(byYear[P], re).map(r => [r.SACTV_NM, amt(r)]));
  for (const r of pick(byYear[Y], re)) items.push({ g, n: r.SACTV_NM, o: r.OFFC_NM, a: amt(r), p: prev[r.SACTV_NM] ?? null });
}
items.sort((a, b) => b.a - a.a);
// 예산 이상 신호: 전년 대비 크게 늘거나 줄어든 사업, 새로 생긴 큰 사업 (회계 간 이동·이자·예비비 등은 뺀다)
const SKIP = /예치|유가증권|주식|유동화증권|비축|여유|전출|전입|내부거래|예비비|이자|상환|국채|예탁|여유자금|기본경비|인건비|운영비|차입|보전|공자기금|지방교부|교부금|정산/;
const kn = n => String(n || '').replace(/\([^)]*\)/g, '').replace(/[\s·ㆍ\-]/g, ''), key = r => kn(r.SACTV_NM), prevMap = {}, prevMeta = {};
for (const r of byYear[P] || []) { if (SKIP.test(`${r.ACTV_NM} ${r.SACTV_NM}`)) continue; const k = key(r); prevMap[k] = (prevMap[k] || 0) + amt(r); prevMeta[k] = { n: r.SACTV_NM, o: r.OFFC_NM }; }
const curMap = {}, meta = {};
for (const r of byYear[Y] || []) { if (SKIP.test(`${r.ACTV_NM} ${r.SACTV_NM}`)) continue; const k = key(r); curMap[k] = (curMap[k] || 0) + amt(r); meta[k] = { n: r.SACTV_NM, o: r.OFFC_NM, f: r.FLD_NM }; }
const rows = Object.entries(curMap).map(([k, a]) => ({ ...meta[k], a, p: prevMap[k] ?? null }));
const up = rows.filter(r => r.p > 0 && r.a - r.p >= 300 && r.a / r.p >= 1.5).sort((a, b) => (b.a - b.p) - (a.a - a.p)).slice(0, 15);
const fresh = rows.filter(r => r.p == null && r.a >= 300).sort((a, b) => b.a - a.a).slice(0, 15);
const down = rows.filter(r => r.p >= 300 && r.a <= r.p * 0.5).sort((a, b) => (a.a - a.p) - (b.a - b.p)).slice(0, 15);
const cut = Object.entries(prevMap).filter(([k, v]) => v >= 500 && curMap[k] == null).map(([k, v]) => ({ ...prevMeta[k], a: 0, p: v })).sort((a, b) => b.p - a.p).slice(0, 10);
const alerts = { up, fresh, down, cut, rule: '늘어남: 300억 원 이상·1.5배 이상 증가 / 새로 생김: 전년에 없던 300억 원 이상 / 줄어듦: 300억 원 이상이던 사업이 절반 이하로' };
console.log('이상 신호', up.length, fresh.length, down.length, cut.length);

writeFileSync(`${OUT}/fiscal.json`, JSON.stringify({ updated: new Date().toISOString(), y: Y, py: P || null, kind, alerts, groups: Object.fromEntries(GROUPS.map(([k, n]) => [k, n])), items, src: '열린재정 세부사업 예산편성현황(ExpenditureBudgetInit5)' }));
console.log('저장', Y, P, items.length, JSON.stringify(items.slice(0, 5)));
