// 국회 공개 자료의 유튜브 주소로 의원별 최근 1년 영상 활동을 받는다. 조회수·좋아요는 받지 않는다.
// 실행: YOUTUBE_API_KEY=키 node scripts/youtube.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const KEY = process.env.YOUTUBE_API_KEY;
const BASE = process.env.YT_BASE || 'https://www.googleapis.com/youtube/v3';
const OUT = process.env.OUT_DIR || 'docs/data';
const CACHE = process.env.YT_CACHE || 'data/youtube-channels.json';
if (!KEY) { console.log('YOUTUBE_API_KEY가 없어 유튜브 수집을 건너뜁니다.'); process.exit(0); }
let units = 0;
class QuotaError extends Error {}
async function api(path, params) {
  units++;
  const r = await fetch(`${BASE}/${path}?` + new URLSearchParams({ key: KEY, ...params }), { signal: AbortSignal.timeout(30000) });
  if (r.status === 403) { const j = await r.json().catch(() => ({})); const why = j.error?.errors?.[0]?.reason || j.error?.status || ''; if (/quota/i.test(why)) throw new QuotaError('할당량 초과'); throw new Error(`403 ${why}`); }
  if (r.status === 404) return { items: [] };
  if (!r.ok) throw new Error(`HTTP ${r.status}`); // 주소에 키가 있으므로 주소는 남기지 않음
  return r.json();
}
export function parseChannel(u) {
  let p; try { p = new URL(u); } catch { return null; }
  if (!/(^|\.)youtube\.com$/.test(p.hostname)) return null;
  const seg = decodeURIComponent(p.pathname).split('/').filter(Boolean); if (!seg.length) return null;
  if (seg[0].startsWith('@')) return { handle: seg[0].slice(1) };
  if (seg[0] === 'channel' && seg[1]) return { id: seg[1] };
  if (seg[0] === 'user' && seg[1]) return { user: seg[1] };
  if (seg[0] === 'c' && seg[1]) return { handle: seg[1], user: seg[1] };
  if (['watch', 'playlist', 'shorts', 'results', 'embed'].includes(seg[0])) return null;
  return { handle: seg[0], user: seg[0] };
}
async function resolve(c) {
  const part = { part: 'id,snippet,contentDetails' };
  const tries = [];
  if (c.id) tries.push({ id: c.id });
  if (c.handle) tries.push({ forHandle: '@' + c.handle });
  if (c.user) tries.push({ forUsername: c.user });
  for (const t of tries) { const j = await api('channels', { ...part, ...t }); if (j.items?.length) return { id: j.items[0].id, title: j.items[0].snippet?.title || '', uploads: j.items[0].contentDetails?.relatedPlaylists?.uploads }; }
  return null;
}
const secs = d => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };
const members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const channels = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const prev = existsSync(`${OUT}/youtube.json`) ? JSON.parse(readFileSync(`${OUT}/youtube.json`, 'utf8')).members || {} : {};
const SINCE = Date.now() - 365 * 864e5;
const out = {}; let unresolved = [], failed = 0, quota = false;
for (const m of members) {
  const url = m.sns?.youtube; if (!url) continue;
  try {
    let ch = channels[url];
    if (!ch) { const c = parseChannel(url); ch = c && await resolve(c); if (!ch) { unresolved.push(m.name); continue; } channels[url] = ch; }
    if (!ch.uploads) { unresolved.push(m.name); continue; }
    const vids = []; let tok, done = false;
    while (!done) {
      const j = await api('playlistItems', { part: 'contentDetails,snippet', playlistId: ch.uploads, maxResults: 50, ...(tok ? { pageToken: tok } : {}) });
      const fresh = (j.items || []).filter(i => Date.parse(i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt) >= SINCE);
      if (fresh.length) {
        const d = await api('videos', { part: 'contentDetails', id: fresh.map(i => i.contentDetails.videoId).join(','), maxResults: 50 });
        const len = Object.fromEntries((d.items || []).map(v => [v.id, secs(v.contentDetails?.duration)]));
        for (const i of fresh) vids.push({ id: i.contentDetails.videoId, t: i.snippet?.title || '', at: i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt, s: len[i.contentDetails.videoId] ?? null });
      }
      tok = j.nextPageToken; done = !tok || fresh.length < (j.items || []).length;
    }
    // 3분 이하는 숏츠에 가까운 짧은 영상으로 추정한다.
    const months = {}; let longs = 0, shorts = 0;
    for (const v of vids) { const k = String(v.at).slice(0, 7); months[k] = months[k] || { l: 0, s: 0 }; if (v.s != null && v.s <= 180) { months[k].s++; shorts++; } else { months[k].l++; longs++; } }
    // 활동 점수: 달마다 긴 영상 1, 짧은 영상 0.25로 세고 월 4점에서 멈춘다. 많이 올린다고 끝없이 오르지 않는다.
    const pts = Object.values(months).reduce((a, x) => a + Math.min(4, x.l + x.s * .25), 0);
    out[m.id] = { url, title: ch.title, longs, shorts, lastAt: vids.map(v => v.at).sort().pop() || null, activeMonths: Object.keys(months).length, online: Math.round(pts / 48 * 1000) / 10,
      recent: vids.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5).map(v => ({ t: v.t, id: v.id, d: String(v.at).slice(0, 10), short: v.s != null && v.s <= 180 })) };
  } catch (e) {
    if (e instanceof QuotaError) { quota = true; console.log('할당량 초과로 중단'); break; }
    failed++; console.log(`${m.name}: ${e.message}`); if (prev[m.id]) out[m.id] = prev[m.id];
  }
}
if (quota) for (const id of Object.keys(prev)) if (!out[id]) out[id] = prev[id];
writeFileSync(CACHE, JSON.stringify(channels));
writeFileSync(`${OUT}/youtube.json`, JSON.stringify({ updated: new Date().toISOString(), resolved: Object.keys(out).length, unresolved, failed, quota, members: out }));
console.log(`유튜브 완료: ${Object.keys(out).length}명, 채널 못 찾음 ${unresolved.length}명 (${unresolved.slice(0, 20).join(', ')}), 실패 ${failed}, 사용 ${units}단위`);
