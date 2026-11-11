// 국회 공개 자료의 유튜브 주소로 의원별 최근 1년 영상 활동을 받는다. 조회수·좋아요는 받지 않는다.
// 실행: YOUTUBE_API_KEY=키 node scripts/youtube.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeCats, catsOfText } from './cats.mjs';
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
const FIELDS = existsSync(`${OUT}/fields.json`) ? Object.entries(JSON.parse(readFileSync(`${OUT}/fields.json`, 'utf8'))).map(([k, f]) => [k, new RegExp(f.words.join('|'))]) : [];
const channels = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const prev = existsSync(`${OUT}/youtube.json`) ? JSON.parse(readFileSync(`${OUT}/youtube.json`, 'utf8')).members || {} : {};
const SINCE = Date.now() - 365 * 864e5;
const out = {}; let unresolved = [], failed = 0, quota = false;
// 할당량에 걸려도 뒷순서 의원이 계속 밀리지 않도록 분야 집계가 없는 의원부터 받는다.
for (const m of [...members].sort((a, b) => !!prev[a.id]?.topics - !!prev[b.id]?.topics)) {
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
    // 법안 분야와 같은 공개 단어로 영상 제목을 센다. 해시태그도 제목의 일부로 본다.
    const topics = {}; for (const v of vids) for (const [k, re] of FIELDS) if (re.test(v.t)) topics[k] = (topics[k] || 0) + 1;
    out[m.id] = { topics, total: vids.length, url, title: ch.title, longs, shorts, lastAt: vids.map(v => v.at).sort().pop() || null, activeMonths: Math.min(12, Object.keys(months).length), online: Math.min(100, Math.round(pts / 48 * 1000) / 10),
      recent: vids.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5).map(v => ({ t: v.t, id: v.id, d: String(v.at).slice(0, 10), short: v.s != null && v.s <= 180 })) };
  } catch (e) {
    if (e instanceof QuotaError) { quota = true; console.log('할당량 초과로 중단'); break; }
    failed++; console.log(`${m.name}: ${e.message}`); if (prev[m.id]) out[m.id] = prev[m.id];
  }
}
if (quota) for (const id of Object.keys(prev)) if (!out[id]) out[id] = prev[id];
// 한 채널이 여러 의원에게 연결되면 주소 오류일 수 있어 모두 뺀다
const byCh = {}; for (const [id, o] of Object.entries(out)) { const c = channels[o.url]?.id; if (c) (byCh[c] = byCh[c] || []).push(id); }
const shared = Object.values(byCh).filter(a => a.length > 1).flat();
for (const id of shared) { unresolved.push(members.find(m => m.id === id).name); delete out[id]; }
// 대통령 채널: 지정한 영상(쇼츠)의 채널을 찾아 같은 방식으로 센다. 제목은 인스타그램과 같은 분류 규칙으로 나눈다.
let president = null; // 지정한 채널이 없으면 비운다(잘못 잡힌 채널이 남지 않도록)
const PRES_VIDEO = (existsSync(`${OUT}/ig-accounts.json`) ? JSON.parse(readFileSync(`${OUT}/ig-accounts.json`, 'utf8')).presidentYoutubeVideo : null) || process.env.YT_PRES_VIDEO;
if (PRES_VIDEO && !quota) {
  try {
    let ch = channels['video:' + PRES_VIDEO];
    if (!ch) { const v = await api('videos', { part: 'snippet', id: PRES_VIDEO }); const cid = v.items?.[0]?.snippet?.channelId; if (cid) { ch = await resolve({ id: cid }); if (ch) channels['video:' + PRES_VIDEO] = ch; } }
    if (ch?.uploads) {
      const vids = []; let tok, done = false;
      while (!done) {
        const j = await api('playlistItems', { part: 'contentDetails,snippet', playlistId: ch.uploads, maxResults: 50, ...(tok ? { pageToken: tok } : {}) });
        const fresh = (j.items || []).filter(i => Date.parse(i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt) >= SINCE);
        if (fresh.length) { const d = await api('videos', { part: 'contentDetails', id: fresh.map(i => i.contentDetails.videoId).join(','), maxResults: 50 }); const len = Object.fromEntries((d.items || []).map(v => [v.id, secs(v.contentDetails?.duration)])); for (const i of fresh) vids.push({ id: i.contentDetails.videoId, t: i.snippet?.title || '', at: i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt, s: len[i.contentDetails.videoId] ?? null }); }
        tok = j.nextPageToken; done = !tok || fresh.length < (j.items || []).length || vids.length >= 600;
      }
      const FW = existsSync(`${OUT}/fields.json`) ? JSON.parse(readFileSync(`${OUT}/fields.json`, 'utf8')) : {}, CATS = makeCats(FW);
      const months = {}, cats = {}, ex = {}, topics = {}; let longs = 0, shorts = 0;
      for (const v of vids) { const k = String(v.at).slice(0, 7); months[k] = months[k] || { l: 0, s: 0 }; if (v.s != null && v.s <= 180) { months[k].s++; shorts++; } else { months[k].l++; longs++; }
        const c = catsOfText(CATS, v.t); (c.length ? c : ['etc']).forEach(x => { cats[x] = (cats[x] || 0) + 1; if (!ex[x]) ex[x] = { d: String(v.at).slice(0, 10), s: v.t.slice(0, 60), u: 'https://www.youtube.com/watch?v=' + v.id }; });
        for (const [k2, re] of FIELDS) if (re.test(v.t)) topics[k2] = (topics[k2] || 0) + 1; }
      president = { title: ch.title, channel: ch.id, total: vids.length, longs, shorts, months, cats, ex, topics, activeMonths: Math.min(12, Object.keys(months).length), at: new Date().toISOString().slice(0, 10),
        recent: vids.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5).map(v => ({ t: v.t, id: v.id, d: String(v.at).slice(0, 10), short: v.s != null && v.s <= 180 })) };
      console.log(`대통령 유튜브: ${ch.title} 최근 1년 영상 ${vids.length}개`);
    } else console.log('대통령 유튜브 채널을 찾지 못했습니다.');
  } catch (e) { if (e instanceof QuotaError) quota = true; console.log('대통령 유튜브 실패: ' + e.message); }
}
writeFileSync(CACHE, JSON.stringify(channels));
writeFileSync(`${OUT}/youtube.json`, JSON.stringify({ updated: new Date().toISOString(), resolved: Object.keys(out).length, unresolved, failed, quota, president, members: out }));
console.log(`유튜브 완료: ${Object.keys(out).length}명, 채널 못 찾음 ${unresolved.length}명 (${unresolved.slice(0, 20).join(', ')}), 실패 ${failed}, 사용 ${units}단위`);
