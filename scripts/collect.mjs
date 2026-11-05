// 열린국회정보 Open API에서 제22대 국회 자료를 받아 docs/data/*.json을 만든다. Node 20 이상, 외부 패키지 없음.
// 실행: ASSEMBLY_API_KEY=인증키 node scripts/collect.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const KEY = process.env.ASSEMBLY_API_KEY;
const BASE = process.env.ASSEMBLY_BASE || 'https://open.assembly.go.kr/portal/openapi';
const AGE = process.env.ASSEMBLY_AGE || '22';
const OUT = process.env.OUT_DIR || 'docs/data';
const CACHE = process.env.CACHE_FILE || 'data/votes-cache.json';
const SLEEP = Number(process.env.SLEEP_MS ?? 220);
if (!KEY) { console.error('ASSEMBLY_API_KEY가 없습니다.'); process.exit(1); }
const API = { members: 'nwvrqwxyaytdsfvhu', bills: 'nzmimeepazxkubdpn', voteBills: 'ncocpgfiaoituanbr', votes: 'nojepdqqaweusdfbi' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const warnings = [];

async function call(id, params) {
  const url = `${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', ...params });
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; await wait(1500 * (i + 1)); }
  }
  throw new Error(`${id} 요청 실패: ${last && last.message}`); // 주소에 키가 있으므로 주소는 남기지 않음
}
async function getAll(id, params = {}) {
  const rows = [];
  for (let page = 1; ; page++) {
    const j = await call(id, { ...params, pIndex: page, pSize: 100 });
    if (j.RESULT) {
      if (j.RESULT.CODE === 'INFO-200') return rows;
      throw new Error(`${id} 오류: ${j.RESULT.CODE} ${j.RESULT.MESSAGE}`);
    }
    const body = j[id]; if (!body) throw new Error(`${id} 응답 형식이 예상과 다릅니다: ${Object.keys(j)}`);
    const head = body[0].head; const res = head[1] && head[1].RESULT;
    if (res && res.CODE !== 'INFO-000') { if (res.CODE === 'INFO-200') return rows; throw new Error(`${id} 오류: ${res.CODE} ${res.MESSAGE}`); }
    const total = Number(head[0].list_total_count); const got = (body[1] && body[1].row) || [];
    rows.push(...got);
    if (!got.length || rows.length >= total) return rows;
    await wait(SLEEP);
  }
}
function need(name, row, fields) {
  if (!row) return;
  const miss = fields.filter(f => !(f in row));
  if (miss.length) throw new Error(`${name} 항목 이름이 다릅니다. 없음: ${miss.join(', ')} / 실제: ${Object.keys(row).join(', ')}`);
}
const PASS = /가결|대안반영|수정안반영/;
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
const VOTE = { '찬성': 'y', '반대': 'n', '기권': 'a', '불참': 'x' };

// 1. 의원
const rawMembers = await getAll(API.members);
need('의원', rawMembers[0], ['HG_NM', 'POLY_NM', 'ORIG_NM', 'MONA_CD', 'REELE_GBN_NM', 'CMITS']);
if (rawMembers.length < 250) throw new Error(`의원 수가 ${rawMembers.length}명뿐이라 저장을 중단합니다.`);
const nameCount = {}; rawMembers.forEach(m => nameCount[m.HG_NM] = (nameCount[m.HG_NM] || 0) + 1);
const homonyms = Object.keys(nameCount).filter(n => nameCount[n] > 1);
if (homonyms.length) warnings.push(`동명이인 ${homonyms.join(', ')}: 이름으로만 구분되는 발의 자료는 계산에서 뺐습니다.`);
const byName = Object.fromEntries(rawMembers.filter(m => nameCount[m.HG_NM] === 1).map(m => [m.HG_NM, m.MONA_CD]));
const stats = {};
rawMembers.forEach(m => stats[m.MONA_CD] = { rep: 0, passed: 0, inCmit: 0, cmitBills: 0, y: 0, n: 0, a: 0, x: 0, recent: [] });
const cmitsOf = m => String(m.CMITS || m.CMIT_NM || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
const codeToM = Object.fromEntries(rawMembers.map(m => [m.MONA_CD, m]));

// 2. 대표발의 법안
const bills = await getAll(API.bills, { AGE });
need('법안', bills[0], ['BILL_ID', 'BILL_NAME', 'PROC_RESULT', 'COMMITTEE', 'PROPOSE_DT']);
let unmatched = 0;
for (const b of bills) {
  const code = b.RST_MONA_CD && stats[b.RST_MONA_CD] ? b.RST_MONA_CD : byName[String(b.RST_PROPOSER || '').trim()];
  if (!code) { unmatched++; continue; }
  const s = stats[code]; s.rep++;
  if (PASS.test(b.PROC_RESULT || '')) s.passed++;
  if (b.COMMITTEE) { s.cmitBills++; if (cmitsOf(codeToM[code]).includes(b.COMMITTEE)) s.inCmit++; }
  s.recent.push({ n: b.BILL_NAME, d: b.PROPOSE_DT, r: b.PROC_RESULT || '계류', u: b.DETAIL_LINK || '' });
}
if (unmatched) warnings.push(`대표발의자를 현직 의원과 연결하지 못한 법안 ${unmatched}건은 뺐습니다(사직·동명이인·위원장 대안 등).`);

// 3. 본회의 표결 (이미 받은 것은 다시 받지 않음)
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const voteBills = await getAll(API.voteBills, { AGE });
need('표결 의안', voteBills[0], ['BILL_ID', 'BILL_NAME']);
let fetched = 0;
for (const b of voteBills) {
  if (cache[b.BILL_ID]) continue;
  const rows = await getAll(API.votes, { AGE, BILL_ID: b.BILL_ID }); await wait(SLEEP);
  if (!rows.length) continue;
  need('의원별 표결', rows[0], ['MONA_CD', 'RESULT_VOTE_MOD']);
  const v = { y: [], n: [], a: [], x: [] };
  rows.forEach(r => { const k = VOTE[r.RESULT_VOTE_MOD]; if (k) v[k].push(r.MONA_CD); });
  cache[b.BILL_ID] = { name: b.BILL_NAME, date: b.PROC_DT || b.RGS_PROC_DT || '', url: b.LINK_URL || b.BILL_URL || '', ...v };
  if (++fetched % 100 === 0) { mkdirSync('data', { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); console.log(`표결 ${fetched}건 받음`); }
}
mkdirSync(CACHE.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
for (const v of Object.values(cache)) for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) if (stats[c]) stats[c][k]++;

// 4. 화면용 자료
const members = rawMembers.map(m => {
  const s = stats[m.MONA_CD], voted = s.y + s.n + s.a, total = voted + s.x;
  s.recent.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return { id: m.MONA_CD, name: m.HG_NM, hanja: m.HJ_NM || '', party: m.POLY_NM, area: m.ORIG_NM, type: m.ELECT_GBN_NM || '', terms: m.REELE_GBN_NM, role: m.JOB_RES_NM || '', cmits: cmitsOf(m), tel: m.TEL_NO || '', web: m.HOMEPAGE || '',
    voteTotal: total, voteRate: pct(voted, total), rep: s.rep, passRate: s.rep >= 5 ? pct(s.passed, s.rep) : null, passed: s.passed, focus: s.cmitBills >= 5 ? pct(s.inCmit, s.cmitBills) : null, y: s.y, n: s.n, a: s.a, x: s.x, recent: s.recent.slice(0, 10) };
});
// 표결 궁합: 찬반이 실제로 갈린 최근 의안을 규칙으로만 고른다(사람이 고르지 않음)
const quiz = Object.entries(cache).map(([id, v]) => ({ id, ...v, cast: v.y.length + v.n.length })).filter(v => v.cast >= 100 && Math.min(v.y.length, v.n.length) / v.cast >= .15)
  .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(v => ({ id: v.id, name: v.name, date: v.date, url: v.url, y: v.y, n: v.n }));
if (quiz.length < 10) warnings.push(`찬반이 갈린 의안이 ${quiz.length}건뿐이라 궁합 문항이 적습니다.`);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/members.json`, JSON.stringify(members));
writeFileSync(`${OUT}/quiz.json`, JSON.stringify(quiz));
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ updated: new Date().toISOString(), age: AGE, members: members.length, bills: bills.length, voteBills: Object.keys(cache).length, warnings }, null, 1));
console.log(`완료: 의원 ${members.length}명, 법안 ${bills.length}건, 표결 의안 ${Object.keys(cache).length}건 (이번 ${fetched}건)`);
warnings.forEach(w => console.log('주의:', w));
