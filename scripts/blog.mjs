// 의원의 공개 네이버 블로그 RSS에서 글 제목과 날짜만 받는다. 본문은 저장하지 않는다. 활동지수에는 넣지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const OUT = process.env.OUT_DIR || 'docs/data', CACHE = process.env.BLOG_CACHE || 'data/blog-cache.json', BASE = process.env.BLOG_BASE || 'https://rss.blog.naver.com';
const SLEEP = Number(process.env.SLEEP_MS ?? 400), DAYS = 365;
const wait = ms => new Promise(r => setTimeout(r, ms));
const members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const FIELDS = Object.entries(JSON.parse(readFileSync(`${OUT}/fields.json`, 'utf8'))).map(([k, f]) => [k, new RegExp(f.words.join('|'))]);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const blogId = u => { try { const p = new URL(u); if (!/(^|\.)blog\.naver\.com$/.test(p.hostname)) return null; const q = p.searchParams.get('blogId'); if (q) return q; const s = p.pathname.split('/').filter(Boolean)[0]; return s && /^[\w-]+$/.test(s) && !/\.(naver|nhn)$/.test(s) ? s : null; } catch { return null; } };
const text = (x, tag) => { const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`).exec(x); return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : ''; };
try { const r = await fetch(`${BASE}/robots.txt`, { signal: AbortSignal.timeout(15000) }); console.log(`robots ${r.status}: ${(await r.text()).slice(0, 200).replace(/\s+/g, ' ')}`); } catch (e) { console.log('robots 확인 실패'); }
const SINCE = Date.now() - DAYS * 864e5; let ok = 0, none = 0, failed = 0, blocked = 0, sample = true; const out = {};
for (const m of members) {
  const id = blogId(m.sns?.blog) || blogId(m.web); if (!id) { none++; continue; }
  const c = cache[m.id] = cache[m.id] && cache[m.id].id === id ? cache[m.id] : { id, posts: {} };
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}.xml`, { headers: { 'User-Agent': 'POLISCOPE-KR RSS reader' }, signal: AbortSignal.timeout(20000) }); await wait(SLEEP);
    if (r.status === 403 || r.status === 429) { blocked++; if (blocked >= 3) { console.log(`접근 거부 ${r.status}, 중단`); break; } continue; }
    if (!r.ok) { failed++; continue; }
    const items = (await r.text()).split('<item>').slice(1);
    if (sample) { console.log(`RSS 글 수 예시: ${items.length}`); sample = false; }
    for (const x of items) { const t = text(x, 'title'), u = text(x, 'link').split('?')[0], at = Date.parse(text(x, 'pubDate')); if (!t || !Number.isFinite(at)) continue; c.posts[createHash('sha1').update(u || t).digest('hex').slice(0, 10)] = { t, u, d: new Date(at + 9 * 36e5).toISOString().slice(0, 10) }; }
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
console.log(`블로그 완료: 성공 ${ok}, 글 있음 ${Object.keys(out).length}, 주소 없음 ${none}, 실패 ${failed}, 거부 ${blocked}`);
