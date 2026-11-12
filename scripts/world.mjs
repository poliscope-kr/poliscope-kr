// 해외 언론의 한국 정치 보도: GDELT(전 세계 뉴스 공개 데이터베이스) DOC 2.0 API로 보도량·논조(tone)와 최근 영어 기사 제목을 받는다.
// 논조 점수는 기계 분석(-: 부정, +: 긍정)이라 참고용이다. 기사 본문은 받지 않는다.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const OUT = process.env.OUT_DIR || 'docs/data', BASE = process.env.GDELT_BASE || 'https://api.gdeltproject.org/api/v2/doc/doc';
const Q = '"South Korea" (politics OR parliament OR "National Assembly" OR lawmakers OR democracy OR election OR "ruling party" OR "opposition party")';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(params) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(BASE + '?' + new URLSearchParams({ format: 'json', ...params }), { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'poliscope-kr (civic data)' } });
      const t = await r.text(); if (!r.ok || !t.trim().startsWith('{')) throw new Error(`HTTP ${r.status} ${t.slice(0, 80)}`);
      return JSON.parse(t);
    } catch (e) { if (i === 3) throw e; await wait(8000 * (i + 1)); }
  }
}
const series = j => (j.timeline?.[0]?.data || []).map(d => [String(d.date).slice(0, 8), +d.value]);
const prev = existsSync(`${OUT}/world.json`) ? JSON.parse(readFileSync(`${OUT}/world.json`, 'utf8')) : {};
const out = { updated: new Date().toISOString(), query: Q, ...prev };
try {
  const tone = series(await get({ query: Q, mode: 'timelinetone', timespan: '12m' })); await wait(6000);
  const vol = series(await get({ query: Q, mode: 'timelinevolraw', timespan: '12m' })); await wait(6000);
  const byMonth = (rows, agg) => { const g = {}; rows.forEach(([d, v]) => (g[d.slice(0, 6)] = g[d.slice(0, 6)] || []).push(v)); return Object.entries(g).sort().map(([m, a]) => [m, agg(a)]); };
  out.toneM = byMonth(tone, a => Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100);
  out.volM = byMonth(vol, a => a.reduce((x, y) => x + y, 0));
  const last = (rows, n) => rows.slice(-n).map(x => x[1]).filter(v => !Number.isNaN(v)), avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null;
  out.tone30 = avg(last(tone, 30)); out.tonePrev30 = avg(tone.slice(-60, -30).map(x => x[1]));
  out.byCountry = {};
  for (const [k, c] of [['미국', 'US'], ['일본', 'JA'], ['중국', 'CH'], ['영국', 'UK']]) {
    try { const t = series(await get({ query: `${Q} sourcecountry:${c}`, mode: 'timelinetone', timespan: '3m' })); out.byCountry[k] = { tone30: avg(last(t, 30)), tone90: avg(t.map(x => x[1])) }; } catch (e) { console.log(`${k} 논조 실패: ${e.message}`); }
    await wait(6000);
  }
  const art = await get({ query: `${Q} sourcelang:english`, mode: 'artlist', maxrecords: 20, sort: 'hybridrel', timespan: '7d' });
  out.articles = (art.articles || []).map(a => ({ t: a.title, u: a.url, d: String(a.seendate || '').slice(0, 8), s: a.domain, c: a.sourcecountry })).filter(a => a.t && /^https?:/.test(a.u)).slice(0, 15);
  out.updated = new Date().toISOString();
  console.log(`해외 보도: 논조 최근 30일 ${out.tone30} (그 전 ${out.tonePrev30}), 기사 ${out.articles.length}건, 나라 ${Object.keys(out.byCountry).length}곳`);
} catch (e) { console.log('GDELT 수집 실패, 기존 자료 유지: ' + e.message); }
writeFileSync(`${OUT}/world.json`, JSON.stringify(out));
