// 네이버 공식 블로그 검색 API로 의원 본인 블로그의 글 제목과 날짜만 받는다. 요약문과 본문은 저장하지 않는다. 활동지수에는 넣지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const BASE = process.env.NAVER_BLOG_BASE || 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const OUT = process.env.OUT_DIR || 'docs/data', CACHE = process.env.BLOG_CACHE || 'data/blog-cache.json';
const SLEEP = Number(process.env.SLEEP_MS ?? 80), PAGES = 3, DAYS = 365;
if (!ID || !SECRET) { console.log('네이버 키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const FIELDS = Object.entries(JSON.parse(readFileSync(`${OUT}/fields.json`, 'utf8'))).map(([k, f]) => [k, new RegExp(f.words.join('|'))]);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const blogId = u => { try { const p = new URL(u); if (!/(^|\.)blog\.naver\.com$/.test(p.hostname)) return null; const q = p.searchParams.get('blogId'); if (q) return q; const s = p.pathname.split('/').filter(Boolean)[0]; return s && /^[\w-]+$/.test(s) ? s : null; } catch { return null; } };
const owner = u => blogId(String(u || '').replace(/^http:/, 'https:'));
const SINCE = Date.now() - DAYS * 864e5; let ok = 0, none = 0, failed = 0, calls = 0, stopped = null; const out = {};
for (const m of members) {
  const id = blogId(m.sns?.blog) || blogId(m.web); if (!id) { none++; continue; }
  const c = cache[m.id] = cache[m.id]?.id === id ? cache[m.id] : { id, posts: {} };
  try {
    for (let p = 0; p < PAGES; p++) {
      calls++;
      const r = await fetch(`${BASE}?` + new URLSearchParams({ query: m.name, display: 100, start: p * 100 + 1, sort: 'date', format: 'json' }), { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }, signal: AbortSignal.timeout(30000) }); await wait(SLEEP);
      if ([401, 403, 429].includes(r.status)) { stopped = `HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`; break; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = (await r.json()).items || [];
      for (const it of items) { if (owner(it.bloggerlink) !== id && owner(it.link) !== id) continue; const d = String(it.postdate || ''); if (!/^\d{8}$/.test(d)) continue; const u = it.link || ''; c.posts[createHash('sha1').update(u).digest('hex').slice(0, 10)] = { t: clean(it.title), u, d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` }; }
      if (items.length < 100) break;
    }
    if (stopped) { console.log('중단:', stopped); break; }
    ok++;
  } catch (e) { failed++; console.log(`${m.name}: ${e.cause?.code || e.message}`); }
}
for (const m of members) {
  const c = cache[m.id]; if (!c) continue;
  for (const [h, p] of Object.entries(c.posts)) if (Date.parse(p.d) < SINCE) delete c.posts[h];
  const ps = Object.values(c.posts).sort((a, b) => b.d.localeCompare(a.d)); if (!ps.length) continue;
  const topics = {}; for (const p of ps) for (const [k, re] of FIELDS) if (re.test(p.t)) topics[k] = (topics[k] || 0) + 1;
  out[m.id] = { n: ps.length, from: ps[ps.length - 1].d, last: ps[0].d, months: new Set(ps.map(p => p.d.slice(0, 7))).size, topics, recent: ps.slice(0, 5) };
}
if (ok) { writeFileSync(CACHE, JSON.stringify(cache)); writeFileSync(`${OUT}/blog.json`, JSON.stringify({ updated: new Date().toISOString(), members: out })); }
console.log(`블로그 완료: 성공 ${ok}, 글 있음 ${Object.keys(out).length}, 주소 없음 ${none}, 실패 ${failed}, 호출 ${calls}${stopped ? ', 중단' : ''}`);
