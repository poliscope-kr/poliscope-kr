// 분야별 집행·이월·불용 추이(열린재정 OPFI117/118/119)와 국회예산정책처 재정사업 평가 보고서를 분야별로 묶는다.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const KEY = (process.env.OPENFISCAL_KEY || '').trim(), BASE = 'https://openapi.openfiscaldata.go.kr';
if (!KEY) { console.log('OPENFISCAL_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function all(code) {
  const out = [];
  for (let p = 1; p < 20; p++) {
    try { const r = await fetch(`${BASE}/${code}?` + new URLSearchParams({ Key: KEY, KEY, Type: 'json', pIndex: p, pSize: 1000 }), { signal: AbortSignal.timeout(60000) }); let j = JSON.parse(await r.text()); if (typeof j === 'string') j = JSON.parse(j);
      if (!j[code]) { console.log(code, JSON.stringify(j).slice(0, 200)); break; } const [hd, rows] = j[code]; out.push(...(rows?.row || [])); if (out.length >= +hd.head[0].list_total_count) break; }
    catch (e) { console.log(code, e.message); break; }
    await wait(300);
  }
  if (out[0]) console.log(code, out.length, JSON.stringify(out[0]).slice(0, 400));
  return out;
}
const res = { updated: new Date().toISOString(), raw: {} };
for (const [k, code] of [['exec', 'OPFI117'], ['carry', 'OPFI118'], ['unused', 'OPFI119']]) res.raw[k] = await all(code);
const F = n => n === '외교·통일' ? '통일·외교' : n, fld = {};
const put = (rows, i, key) => rows.forEach(r => { const f = F(r.FLD_NM), y = r.ACNT_YR; ((fld[f] = fld[f] || {})[y] = fld[f][y] || [0, 0, 0, 0])[i] += Number(r[key] || 0); });
put(res.raw.exec, 0, 'SUM_BDG_CAMT'); put(res.raw.exec, 1, 'SUM_EXE_AMT'); put(res.raw.carry, 2, 'SUM_NYR_BFW_AMT'); put(res.raw.unused, 3, 'SUM_DUSE_AMT');
writeFileSync('docs/data/execution.json', JSON.stringify({ updated: res.updated, unit: '억 원', cols: ['예산현액', '집행액', '다음 해로 이월', '불용'], src: '기획재정부 열린재정 분야별 집행·이월·불용 추이(결산 기준)', fld }));
console.log(Object.keys(fld));
