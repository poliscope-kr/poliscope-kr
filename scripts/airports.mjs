// 한국공항공사 전국공항 수송실적(공공데이터포털): 공항별 연도·월별 여객 수.
// '세금은 어디로 샜나'의 공항 사례에서 "예측 대비 실제"를 자동으로 새로 고친다.
import { writeFileSync } from 'node:fs';
const KEY = (process.env.DATA_GO_KR_KEY || '').trim(), OUT = 'docs/data';
if (KEY.length < 20) { console.log('DATA_GO_KR_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(s, e, route) {
  const u = `https://apis.data.go.kr/B551178/airport-transport-stats/info?serviceKey=${KEY}&pageNo=1&numOfRows=50&startDePd=${s}&endDePd=${e}&routeBe=${route}&type=json`;
  for (let i = 0; i < 3; i++) {
    try { const j = await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json(); const it = j.response?.body?.items?.item; if (j.response?.header?.resultCode !== '00') { console.log(s, e, route, j.response?.header); return null; } return Array.isArray(it) ? it : it ? [it] : []; }
    catch (er) { await wait(3000 * (i + 1)); }
  }
  return null;
}
const now = new Date(), lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1), ym = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
const years = {}, months = {}, add = (o, a, k, v) => { o[a] = o[a] || {}; o[a][k] = (o[a][k] || 0) + v; };
for (let y = 2010; y <= lastM.getFullYear(); y++) {
  const e = y === lastM.getFullYear() ? ym(lastM) : `${y}12`;
  for (const route of [0, 1]) { const rows = await get(`${y}01`, e, route); for (const r of rows || []) add(years, r.Airport, y, Math.round(r.subpassenger || 0)); await wait(300); }
}
for (let i = 23; i >= 0; i--) {
  const d = new Date(lastM.getFullYear(), lastM.getMonth() - i, 1), k = ym(d);
  for (const route of [0, 1]) { const rows = await get(k, k, route); for (const r of rows || []) add(months, r.Airport, k, Math.round(r.subpassenger || 0)); await wait(300); }
}
const last12 = Object.fromEntries(Object.entries(months).map(([a, m]) => [a, Object.entries(m).sort().slice(-12).reduce((t, [, v]) => t + v, 0)]));
writeFileSync(`${OUT}/airports.json`, JSON.stringify({ updated: new Date().toISOString(), lastMonth: ym(lastM), years, months, last12, src: '한국공항공사 전국공항 수송실적통계(공공데이터포털)' }));
console.log('공항', Object.keys(years).length, '최근 12개월', JSON.stringify(last12));
