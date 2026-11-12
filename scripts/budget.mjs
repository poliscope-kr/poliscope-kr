// 나라 전체 예산(총지출 기준)을 분야·부문·부처·세부사업별로 모은다. 자료: 기획재정부 열린재정 TotalExpenditure5
import { writeFileSync } from 'node:fs';
const KEY = (process.env.OPENFISCAL_KEY || '').trim(), BASE = 'https://openapi.openfiscaldata.go.kr';
if (!KEY) { console.log('OPENFISCAL_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function call(code, params, p) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(`${BASE}/${code}?` + new URLSearchParams({ Key: KEY, KEY, Type: 'json', pIndex: p, pSize: 1000, ...params }), { signal: AbortSignal.timeout(60000) }); let j = JSON.parse(await r.text()); if (typeof j === 'string') j = JSON.parse(j);
      if (!j[code]) { if (p === 1) console.log(code, params.FSCL_YY, JSON.stringify(j).slice(0, 200)); return null; } const [hd, rows] = j[code]; return { total: +hd.head[0].list_total_count, rows: rows?.row || [] }; }
    catch (e) { await wait(3000 * (i + 1)); }
  }
  return null;
}
async function year(y) { const out = []; for (let p = 1; p < 40; p++) { const r = await call('TotalExpenditure5', { FSCL_YY: y, BDG_FND_DIV_CD: 0, ANEXP_INQ_STND_CD: 1 }, p); if (!r) break; out.push(...r.rows); if (!r.rows.length || out.length >= r.total) break; await wait(300); } return out; }
const now = new Date().getFullYear(), Y = {};
for (const y of [now + 1, now, now - 1, now - 2, now - 3, now - 4, now - 5]) { const rows = await year(y); console.log('예산', y, rows.length, rows[0] ? Object.keys(rows[0]).join(',') : ''); if (rows.length) Y[y] = rows; }
const amtOf = r => { const d = Number(r.Y_YY_DFN_MEDI_KCUR_AMT || 0), m = Number(r.Y_YY_MEDI_KCUR_AMT || 0); return d > 0 ? d : m; }, final = rows => rows.some(r => Number(r.Y_YY_DFN_MEDI_KCUR_AMT || 0) > 0);
const ys = Object.keys(Y).map(Number).sort((a, b) => b - a), sumBy = (rows, f) => { const o = {}; for (const r of rows) { const k = f(r) || '기타'; o[k] = (o[k] || 0) + amtOf(r); } return Object.entries(o).map(([k, v]) => [k, Math.round(v / 1e5)]).sort((a, b) => b[1] - a[1]); }; // 천원 → 억원
const years = {};
for (const y of ys) {
  const rows = Y[y];
  years[y] = { kind: final(rows) ? 'final' : 'draft', total: Math.round(rows.reduce((t, r) => t + amtOf(r), 0) / 1e5), fld: sumBy(rows, r => r.FLD_NM), sect: sumBy(rows, r => `${r.FLD_NM}|${r.SECT_NM}`), offc: sumBy(rows, r => r.OFFC_NM).slice(0, 30), top: sumBy(rows, r => `${r.OFFC_NM}|${r.SACTV_NM}|${r.FLD_NM}`).slice(0, 40) };
}
writeFileSync('docs/data/budget.json', JSON.stringify({ updated: new Date().toISOString(), unit: '억 원', basis: '총지출(예산+기금)', src: '기획재정부 열린재정 세부사업 예산편성현황(총지출)', years }));
console.log(Object.entries(years).map(([y, v]) => `${y} ${v.kind} ${v.total}억 ${v.fld.slice(0, 3).map(x => x.join(':')).join(' ')}`).join('\n'));
