// 인스타그램 공식 API(Business Discovery)로 의원 공개 계정의 팔로워·게시물·반응 수를 모은다.
// 필요: IG_TOKEN(페이스북 페이지 토큰), IG_USER_ID(조회하는 쪽 '의정 나침반' 비즈니스 계정 번호).
// 계정 찾기: docs/data/ig-accounts.json에 사람이 확인한 아이디가 있으면 그것을 쓰고,
// 없으면 국회 공개 SNS 주소(페이스북·블로그·유튜브)의 아이디를 후보로 조회해 계정 이름·소개에 의원 이름이 있을 때만 '자동 확인'으로 받아들인다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const TOKEN = process.env.IG_TOKEN, ME = process.env.IG_USER_ID, OUT = process.env.OUT_DIR || 'docs/data';
const GRAPH = process.env.IG_GRAPH || 'https://graph.facebook.com/v21.0';
const MAX_CALLS = Number(process.env.IG_MAX_CALLS ?? 170), GAP = Number(process.env.IG_GAP_MS ?? 19000); // 시간당 200회 한도 아래로
if (!TOKEN || !ME) { console.log('IG_TOKEN 또는 IG_USER_ID가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const load = (p, d) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d; } catch { return d; } };

const M = load(`${OUT}/members.json`, []);
const manual = load(`${OUT}/ig-accounts.json`, { accounts: {} }).accounts || {};   // { 의원ID: 'username' 또는 null(계정 없음 확인) }
const prev = load(`${OUT}/instagram.json`, { members: {}, tried: {} });
const data = { members: prev.members || {}, tried: prev.tried || {} };
let calls = 0, lastErr = '';

async function bd(username, withMedia) {
  if (calls >= MAX_CALLS) return { stop: true };
  if (calls) await wait(GAP);
  calls++;
  const f = 'username,name,biography,website,followers_count,media_count' + (withMedia ? ',media.limit(30){timestamp,like_count,comments_count,media_product_type,permalink}' : '');
  const url = `${GRAPH}/${ME}?` + new URLSearchParams({ fields: `business_discovery.username(${username}){${f}}`, access_token: TOKEN });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); const j = await r.json();
    if (j.error) {
      const c = j.error.code, s = j.error.error_subcode;
      if (c === 4 || c === 17 || c === 32 || c === 613) { lastErr = '호출 한도'; return { stop: true }; }
      if (c === 190) throw new Error('토큰이 만료되었거나 잘못되었습니다(IG_TOKEN을 다시 발급해 주세요).');
      if (c === 10 || c === 200) throw new Error('권한이 부족합니다: ' + j.error.message);
      return { none: true, why: s === 2207013 ? '계정 없음 또는 개인 계정' : j.error.message };
    }
    return { ok: j.business_discovery };
  } catch (e) { if (/토큰|권한/.test(e.message)) throw e; lastErr = e.message; return { none: true, why: e.message }; }
}

const handleOf = u => { try { const x = new URL(u); const seg = x.pathname.split('/').filter(Boolean); let h = x.hostname.includes('youtube') ? (seg[0] || '').replace(/^@/, '') : seg[0] || ''; if (h === 'profile.php' || h === 'channel' || h === 'pages') return ''; h = decodeURIComponent(h).toLowerCase(); return /^[a-z0-9._]{3,30}$/.test(h) ? h : ''; } catch { return ''; } };
const nameOk = (m, a) => { const t = `${a.name || ''} ${a.biography || ''}`; return t.includes(m.name) || (m.hanja && t.includes(m.hanja)); };

function stats(m, a, src) {
  const media = a.media?.data || [], now = Date.now(), d30 = media.filter(x => now - Date.parse(x.timestamp) <= 30 * 864e5);
  const avg = (arr, k) => arr.length ? Math.round(arr.reduce((s, x) => s + (x[k] || 0), 0) / arr.length) : null;
  data.members[m.id] = { u: a.username, f: a.followers_count ?? null, mc: a.media_count ?? null, p30: d30.length, reels30: d30.filter(x => x.media_product_type === 'REELS').length,
    likes: avg(media.slice(0, 12), 'like_count'), cmts: avg(media.slice(0, 12), 'comments_count'), last: media[0]?.timestamp?.slice(0, 10) || '', src, at: new Date().toISOString().slice(0, 10),
    recent: media.slice(0, 3).map(x => ({ d: x.timestamp?.slice(0, 10), l: x.like_count ?? null, c: x.comments_count ?? null, u: x.permalink || '' })) };
}

try {
  // 1) 계정이 정해진 의원: 오래전에 갱신한 순서로 통계 갱신
  const known = M.filter(m => manual[m.id] || (manual[m.id] !== null && data.members[m.id]?.u))
    .sort((a, b) => String(data.members[a.id]?.at || '').localeCompare(String(data.members[b.id]?.at || '')));
  for (const m of known) {
    const u = manual[m.id] || data.members[m.id].u, r = await bd(u, true);
    if (r.stop) break;
    if (r.ok) stats(m, r.ok, manual[m.id] ? 'manual' : (data.members[m.id]?.src || 'auto'));
    else if (manual[m.id]) data.members[m.id] = { u, none: r.why, src: 'manual', at: new Date().toISOString().slice(0, 10) };
  }
  // 2) 아직 계정을 모르는 의원: 국회 공개 SNS 주소의 아이디로 후보 조회
  for (const m of M) {
    if (calls >= MAX_CALLS) break;
    if (manual[m.id] === null || manual[m.id] || data.members[m.id]?.u) continue;
    const cands = [...new Set(Object.values(m.sns || {}).map(handleOf).filter(Boolean))].filter(h => !(data.tried[m.id] || []).includes(h));
    for (const h of cands) {
      const r = await bd(h, true); if (r.stop) break;
      (data.tried[m.id] = data.tried[m.id] || []).push(h);
      if (r.ok && nameOk(m, r.ok)) { stats(m, r.ok, 'auto'); break; }
    }
  }
} catch (e) { console.log('중단: ' + e.message); if (!Object.keys(data.members).length) process.exit(1); }

if (manual) for (const [id, u] of Object.entries(manual)) if (u === null) delete data.members[id];
const found = Object.values(data.members).filter(x => x.u && !x.none).length;
writeFileSync(`${OUT}/instagram.json`, JSON.stringify({ updated: new Date().toISOString(), found, members: data.members, tried: data.tried }));
console.log(`인스타그램: 호출 ${calls}회, 확인된 계정 ${found}명${lastErr ? ' (' + lastErr + ')' : ''}`);
