// '이 법, 그 후': 본회의 의결 전후 주별 보도량. 네이버 뉴스 검색 결과 중 제목에 법 이름이 있는 기사만 센다. 기사 전문은 저장하지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const BASE = process.env.NAVER_BASE || 'https://naverapihub.apigw.ntruss.com/search/v1/news';
const OUT = process.env.OUT_DIR || 'docs/data', CACHE = process.env.BUZZ_CACHE || 'data/buzz-cache.json';
const SLEEP = Number(process.env.SLEEP_MS ?? 60), PAGES = 3, BEFORE = 6, AFTER = 6, WEEK = 7 * 864e5;
if (!ID || !SECRET) { console.log('네이버 키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
// 일부개정법률안(대안)(위원장) → 법 이름. 공포된 이름이 있으면 그것을 쓴다.
const lawName = l => (l.promName || l.name).replace(/\s*(?:일부|전부)?(?:개정|제정|폐지)?법률안.*$/, '').replace(/\s*\(.*$/, '').trim();
const { laws } = JSON.parse(readFileSync(`${OUT}/laws.json`, 'utf8'));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const NOW = Date.now(); let calls = 0, got = 0, failed = 0, stopped = null;
for (const l of laws) {
  const name = lawName(l), vote = Date.parse(l.date), c = cache[l.id];
  if (!/법/.test(name) || !Number.isFinite(vote)) continue;
  if (c && (NOW - Date.parse(c.at) < WEEK || Date.parse(c.at) > vote + (AFTER + 1) * WEEK)) continue; // 창이 닫힌 뒤 받은 자료는 다시 받지 않는다
  const seen = new Set(), counts = Array(BEFORE + AFTER + 1).fill(0);
  try {
    for (let p = 0; p < PAGES; p++) {
      calls++;
      const r = await fetch(`${BASE}?` + new URLSearchParams({ query: `"${name}"`, display: 100, start: p * 100 + 1, sort: 'sim', format: 'json' }), { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status === 401 || r.status === 403) { stopped = `HTTP ${r.status}`; break; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = (await r.json()).items || []; await wait(SLEEP);
      for (const it of items) {
        const t = clean(it.title), at = Date.parse(it.pubDate);
        if (!t.includes(name) || seen.has(t) || !Number.isFinite(at)) continue;
        seen.add(t);
        const i = Math.floor((at - vote) / WEEK) + BEFORE;
        if (i >= 0 && i < counts.length) counts[i]++;
      }
      if (items.length < 100) break;
    }
    if (stopped) break;
    cache[l.id] = { at: new Date().toISOString(), name, counts }; got++;
  } catch (e) { failed++; console.log(`${name}: ${e.cause?.code || e.message}`); if (failed > 10) break; }
}
if (got) writeFileSync(CACHE, JSON.stringify(cache));
const out = {}; for (const l of laws) if (cache[l.id]) out[l.id] = { name: cache[l.id].name, counts: cache[l.id].counts, before: BEFORE, sum: cache[l.id].counts.reduce((a, b) => a + b, 0) };
writeFileSync(`${OUT}/buzz.json`, JSON.stringify({ updated: new Date().toISOString(), laws: out }));
console.log(`보도량 완료: ${Object.keys(out).length}건 (이번 ${got}건, 호출 ${calls}회, 실패 ${failed}${stopped ? ', 중단: ' + stopped : ''})`);
