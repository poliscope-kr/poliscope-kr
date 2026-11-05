// 오늘의 국회 사건 사건: 최근 24시간 보도 제목과 국회 공식 일정을 모은다. 기사 전문은 저장하지 않고, AI 판단도 하지 않는다.
import { writeFileSync } from 'node:fs';
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET, KEY = process.env.ASSEMBLY_API_KEY;
const NBASE = process.env.NAVER_BASE || 'https://naverapihub.apigw.ntruss.com/search/v1/news', ABASE = process.env.ASSEMBLY_BASE || 'https://open.assembly.go.kr/portal/openapi', OUT = process.env.OUT_DIR || 'docs/data';
const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&middot;/g, '·').trim();
const now = Date.now(), kst = ms => new Date(ms + 9 * 36e5).toISOString(), todayK = kst(now).slice(0, 10);
const QUERIES = ['국회', '국회 본회의', '국회 상임위', '국정감사', '여야 공방', '국회의원 논란', '국회의원 의혹', '국회 법안 통과'];
const IN = /국회|본회의|상임위|법사위|예결위|국감|국정감사|여야|의원|원내대표|교섭단체|입법/, OUTSIDE = /시의회|도의회|군의회|구의회|시의원|도의원|군의원|구의원|지방의회|기초의원|광역의원|미국|미\s*의회|일본|중국|러시아|영국|유럽의회|대만|의원내각|병원|한의원|치과의원/;
const RULES = [['case', /기소|재판|구속|수사|압수수색|의혹|논란|고발|고소|징계|윤리위|유죄|무죄|항소|상고|선고|체포|횡령|뇌물|사퇴|파문|막말|폭로/], ['fight', /비판|비난|공세|설전|맹공|규탄|저격|직격|공방|충돌|반발|일침|탄핵|특검|대치|파행|퇴장|강행/], ['bill', /법안|개정안|제정안|발의|입법|법률|통과|가결|본회의|국정감사|국감|대정부질문|상임위|예결위|예산안|심사|공청회|청문회/]];
const kind = t => (RULES.find(([, r]) => r.test(t)) || ['etc'])[0];
const bigrams = t => { const s = t.replace(/[^가-힣A-Za-z0-9]/g, ''), o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
const sim = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
let items = [], newsOk = false;
if (ID && SECRET) {
  const seen = new Set();
  for (const q of QUERIES) for (const start of [1, 101]) {
    try {
      const r = await fetch(`${NBASE}?` + new URLSearchParams({ query: q, display: 100, start, sort: 'date', format: 'json' }), { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.log(q, 'HTTP', r.status); continue; }
      newsOk = true;
      for (const a of (await r.json()).items || []) {
        const ms = Date.parse(a.pubDate), t = clean(a.title), u = a.originallink || a.link;
        if (!(now - ms < 864e5) || !IN.test(t) || OUTSIDE.test(t) || seen.has(u)) continue;
        seen.add(u); items.push({ t, u, ms, g: bigrams(t) });
      }
    } catch (e) { console.log(q, '실패', e.message); }
  }
}
items.sort((a, b) => b.ms - a.ms);
const clusters = [];
for (const it of items) { const c = clusters.find(c => sim(c.g, it.g) >= 0.35); if (c) { c.n++; c.first = Math.min(c.first, it.ms); } else clusters.push({ ...it, n: 1, first: it.ms }); }
const host = u => { try { return new URL(u).hostname.replace(/^(www|m|news)\./, ''); } catch { return ''; } };
const groups = { case: [], fight: [], bill: [], etc: [] };
clusters.sort((a, b) => b.n - a.n || b.ms - a.ms);
for (const c of clusters) groups[kind(c.t)].push({ t: c.t, u: c.u, n: c.n, at: kst(c.ms).slice(11, 16), from: host(c.u) });
for (const k in groups) groups[k] = groups[k].slice(0, 12);
console.log(`기사 ${items.length}건, 묶음 ${clusters.length}개`, Object.entries(groups).map(([k, v]) => `${k}:${v.length}`).join(' '));
for (const k in groups) console.log(k, JSON.stringify(groups[k].slice(0, 5).map(x => `${x.n} ${x.t}`)));
// 국회 공식 일정: 세미나 일정은 최신순이라 앞쪽만 본다.
async function first(id, params = {}) { const r = await fetch(`${ABASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: 1, pSize: 100, ...params }), { signal: AbortSignal.timeout(30000) }); const j = await r.json(); return j[id]?.[1]?.row || []; }
let events = [], press = [];
if (KEY) {
  try { const rows = []; for (let p = 1; p <= 3; p++) rows.push(...await first('nfcoioopazrwmjrgs', { pIndex: p })); events = rows.filter(r => r.SDATE === todayK).map(r => ({ t: clean(r.TITLE), at: r.STIME || '', who: clean(r.NAME).slice(0, 80), where: clean(r.LOCATION), u: r.LINK || '' })); console.log('오늘 행사', events.length, '첫 날짜', rows[0]?.SDATE, '끝', rows.at(-1)?.SDATE); } catch (e) { console.log('일정 실패', e.message); }
  try { const rows = await first('npbzvuwvasdqldskm'); console.log('기자회견 예시', JSON.stringify(rows[0] || null).slice(0, 500)); press = rows; } catch (e) { console.log('기자회견 실패', e.message); }
}
if (!newsOk && !events.length) { console.log('자료가 없어 저장하지 않습니다.'); process.exit(0); }
writeFileSync(`${OUT}/today.json`, JSON.stringify({ updated: new Date().toISOString(), total: items.length, groups, events: events.slice(0, 30), eventCount: events.length }));
