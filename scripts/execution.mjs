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
writeFileSync('docs/data/execution.json', JSON.stringify(res));
