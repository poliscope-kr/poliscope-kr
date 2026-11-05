// 네이버 뉴스 검색으로 의원별 보도를 받아 제목 기준으로 분류한다. 기사 전문은 저장하지 않는다.
// 실행: NAVER_CLIENT_ID=.. NAVER_CLIENT_SECRET=.. node scripts/news.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
const BASE = process.env.NAVER_BASE || 'https://naverapihub.apigw.ntruss.com/search/v1/news';
const OUT = process.env.OUT_DIR || 'docs/data';
const CACHE = process.env.NEWS_CACHE || 'data/news-cache.json';
const SLEEP = Number(process.env.SLEEP_MS ?? 60), MAX_PAGES = Number(process.env.NEWS_PAGES ?? 5), WEEKS = 12;
if (!ID || !SECRET) { console.log('네이버 키가 없어 기사 수집을 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
let calls = 0;
class Stop extends Error {}
async function search(query, start) {
  calls++;
  const r = await fetch(`${BASE}?` + new URLSearchParams({ query, display: 100, start, sort: 'date', format: 'json' }), { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }, signal: AbortSignal.timeout(30000) });
  if (r.status === 429) throw new Stop('호출 한도 초과');
  if (r.status === 401 || r.status === 403) throw new Stop(`인증 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
// 제목 기준 규칙 분류. 앞의 규칙이 우선한다. 규칙은 공개되어 있고, 틀릴 수 있다.
const RULES = [
  ['case', /기소|재판|구속|수사|압수수색|의혹|논란|고발|고소|징계|윤리위|유죄|무죄|항소|상고|선고|체포|횡령|뇌물/],
  ['fight', /비판|비난|공세|설전|맹공|규탄|사퇴\s*촉구|저격|직격|막말|공방|충돌|반발|일침|탄핵|내란|특검/],
  ['policy', /법안|개정안|제정안|발의|입법|법률|국정감사|국감|대정부질문|상임위|예결위|토론회|정책|예산안|심사|질의|공청회|제도\s*개선/],
  ['local', /지역구|민원|간담회|방문|예산\s*확보|국비|특별교부세|유치|주민|현장|착공|개통|건립|지원\s*사업|전통시장/],
];
const classify = t => (RULES.find(([, re]) => re.test(t)) || ['etc'])[0];
const weekOf = ms => { const d = new Date(ms + 9 * 36e5); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const nameCount = {}; members.forEach(m => nameCount[m.name] = (nameCount[m.name] || 0) + 1);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const NOW = Date.now(), SINCE = NOW - WEEKS * 7 * 864e5, SEEN_DAYS = NOW - 21 * 864e5;
let stopped = null, done = 0, failed = 0;
for (const m of members) {
  const c = cache[m.id] = cache[m.id] || { weeks: {}, seen: {}, recent: [] };
  const areaWord = /비례/.test(m.area) ? null : m.area.split(' ').pop().replace(/[갑을병정무]$/, '').replace(/(특별시|광역시|시|군|구)$/, '');
  const short = String(m.party).replace(/당$/, '').slice(0, 2);
  const nameRe = new RegExp(m.name + '\\s*(?:국회)?의원|' + m.name + '\\s*(?:대표|원내대표|위원장|최고위원|장관|총리|의장|부의장|후보|전\\s*대표)');
  const otherLevel = new RegExp(m.name + '\\s*(?:시|도|구|군)(?:의회\\s*)?의원|[가-힣]{1,6}(?:시의원|도의원|구의원|군의원)\\s*' + m.name);
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const j = await search(`${m.name} 의원`, p * 100 + 1); await wait(SLEEP);
      const items = j.items || []; let old = 0, known = 0;
      for (const it of items) {
        const at = Date.parse(it.pubDate); if (!Number.isFinite(at) || at < SINCE) { old++; continue; }
        const title = clean(it.title), desc = clean(it.description), text = title + ' ' + desc;
        if (!title.includes(m.name) || otherLevel.test(text)) continue;    // 제목에 이름이 있는 기사만 센다
        if (!nameRe.test(text) && !text.includes(m.party) && !(areaWord && text.includes(areaWord))) continue;
        if (nameCount[m.name] > 1 && !(areaWord && text.includes(areaWord))) continue; // 동명이인은 지역이 확인될 때만
        const h = createHash('sha1').update(title).digest('hex').slice(0, 10);
        if (c.seen[h]) { known++; continue; }
        c.seen[h] = at;
        const cat = classify(title), w = weekOf(at);
        (c.weeks[w] = c.weeks[w] || {})[cat] = (c.weeks[w][cat] || 0) + 1;
        c.recent.push({ t: title, u: it.originallink || it.link, d: new Date(at + 9 * 36e5).toISOString().slice(0, 10), c: cat });
      }
      if (items.length < 100 || old > 0 || known > 30) break;
    }
    done++;
  } catch (e) {
    if (e instanceof Stop) { stopped = e.message; console.log('중단:', e.message); break; }
    failed++; console.log(`${m.name}: ${e.message}`);
  }
}
if (stopped && !done) { console.log(`기사 수집 실패, 기존 자료 유지: ${stopped}`); process.exit(0); }
const out = {};
for (const m of members) {
  const c = cache[m.id]; if (!c) continue;
  for (const h of Object.keys(c.seen)) if (c.seen[h] < SEEN_DAYS) delete c.seen[h];
  for (const w of Object.keys(c.weeks)) if (Date.parse(w) < SINCE - 7 * 864e5) delete c.weeks[w];
  c.recent = c.recent.sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
  const totals = { policy: 0, local: 0, fight: 0, case: 0, etc: 0 }; let pts = 0;
  for (const v of Object.values(c.weeks)) { for (const k of Object.keys(totals)) totals[k] += v[k] || 0; pts += Math.min(3, (v.policy || 0) + (v.local || 0)); }
  // 정책·입법과 지역 활동 보도만 주 3건까지 센다. 공방·사건 보도는 더하지도 빼지도 않는다.
  out[m.id] = { totals, news: Math.round(Math.min(100, pts / (WEEKS * 3) * 100) * 10) / 10, weeks: Object.keys(c.weeks).length, recent: c.recent };
}
if (Object.keys(cache).length) writeFileSync(CACHE, JSON.stringify(cache));
writeFileSync(`${OUT}/news.json`, JSON.stringify({ updated: new Date().toISOString(), done, failed, stopped, members: out }));
console.log(`기사 완료: ${done}명, 실패 ${failed}, 호출 ${calls}회${stopped ? ', 중단: ' + stopped : ''}`);
