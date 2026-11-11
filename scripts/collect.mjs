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
const START = Date.now();
const BUDGET_MIN = Number(process.env.BUDGET_MIN ?? 90); // 이 시간을 넘으면 받은 만큼 저장하고 다음 실행에서 이어 받음
const log = m => console.log(`[${Math.round((Date.now() - START) / 1000)}초] ${m}`);

async function call(id, params) {
  const url = `${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', ...params });
  let last;
  for (let i = 0; i < 7; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; console.log(`${id} 연결 재시도 ${i + 1}/7: ${e.cause?.code || e.message}`); await wait(5000 * 2 ** i); }
  }
  throw new Error(`${id} 요청 실패: ${last && (last.cause?.code || last.message)}`); // 주소에 키가 있으므로 주소는 남기지 않음
}
async function getAll(id, params = {}, quiet = true) {
  const rows = []; let prevFirst = null;
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
    const first = JSON.stringify(got[0]);
    if (first === prevFirst) throw new Error(`${id}: 같은 페이지가 반복됩니다 (${page}쪽). 무한 반복을 막기 위해 중단합니다.`);
    prevFirst = first;
    if (!Number.isFinite(total)) throw new Error(`${id}: 전체 건수를 읽지 못했습니다.`);
    rows.push(...got);
    if (!quiet && page % 20 === 0) log(`${id} ${rows.length}/${total}건`);
    if (page > Math.ceil(total / 100) + 2) throw new Error(`${id}: 예상보다 페이지가 많아 중단합니다.`);
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

// 생활 분야 분류: 법률 이름의 단어로만 나눈다. 규칙은 docs/fields.json으로 공개한다.
const FIELDS = {
  housing: ['주거·부동산', /주택|임대차|전세|공공주택|도시정비|재건축|재개발|건축물|부동산|택지|월세/],
  jobs: ['일자리·노동', /근로|고용|노동|최저임금|산업안전|산업재해|퇴직급여|직업안정|파견|비정규|임금채권|남녀고용/],
  welfare: ['복지·돌봄', /복지|연금|기초생활|장애인|노인|아동|한부모|영유아|보육|저출산|출산|돌봄|청소년|다문화|긴급지원|자살/],
  health: ['의료·건강', /의료|약사|건강보험|응급|감염병|보건|간호|정신건강|암관리|국민건강|식품|마약류|의약품|혈액|공공보건/],
  education: ['교육', /교육|학교|고등교육|학원|사립학교|교원|학자금|평생교육|대학/],
  business: ['소상공인·중소기업', /소상공인|전통시장|상가건물|가맹|중소기업|벤처|하도급|유통산업|상생|자영업|신용보증|대규모유통/],
  living: ['물가·소비·생활비', /소비자|물가|전자상거래|할부|통신|전기사업|도시가스|대중교통|여객|공정거래|이자제한|대부업|채무자|서민금융|방문판매/],
  tax: ['세금', /소득세|부가가치세|법인세|상속세|증여세|종합부동산세|지방세|조세|관세|국세|개별소비세|교통·에너지/],
  rural: ['농어촌', /농업|농어|농지|농산물|축산|수산|어업|양곡|산림|임업|귀농|쌀/],
  safety: ['안전·재난', /재난|소방|도로교통|교통안전|화재|어린이|전기안전|가스안전|철도안전|해사안전|범죄피해|스토킹|가정폭력|성폭력/],
};
const fieldsOf = n => Object.entries(FIELDS).filter(([, [, re]]) => re.test(n)).map(([k]) => k);

// 약자 분야: 법률 이름의 단어로만 나눈다. 규칙은 docs/data/weak.json으로 공개한다.
const WEAK = {
  disabled: ['장애인', /장애인|장애아동|발달장애|특수교육/],
  elder: ['노인', /노인|기초연금|치매/],
  child: ['아동·청소년·한부모', /아동|청소년|한부모|영유아|보육|입양|학교밖/],
  poor: ['저소득·취약계층', /기초생활|긴급복지|사회보장급여|주거급여|노숙|취약계층|서민금융/],
  care: ['돌봄·간병', /돌봄|간병|장기요양|호스피스/],
  worker: ['취약 노동자·산재', /산업재해|산업안전|임금채권|최저임금|파견근로|기간제|외국인근로자|가사근로|건설근로자|특수형태/],
  victim: ['범죄·재난 피해자', /범죄피해|가정폭력|성폭력|스토킹|전세사기|아동학대|자살|피해자/],
};
const weakOf = n => Object.entries(WEAK).filter(([, [, re]]) => re.test(n)).map(([k]) => k);

// 역사 관련 입법: 일제강점기·독립운동·친일 청산·강제동원 피해·역사 왜곡 대응. 법률 이름의 단어로만 나눈다. 규칙은 docs/data/history.json으로 공개한다.
const HIST = {
  indep: ['독립운동·독립유공자 예우', /독립유공자|독립운동|순국선열|애국지사|임시정부|3·1운동|3ㆍ1운동|삼일운동/],
  purge: ['친일 청산·친일재산 환수', /친일|반민족/],
  victim: ['강제동원·일본군 위안부 피해자', /강제동원|강제징용|일본군|위안부|대일항쟁|사할린/],
  distort: ['역사 왜곡·독도 대응', /역사왜곡|역사 왜곡|독도|사도광산/],
};
const histOf = n => Object.entries(HIST).filter(([, [, re]]) => re.test(n)).map(([k]) => k);

// 1. 의원
log('의원 명단 받는 중');
const rawMembers = await getAll(API.members, {}, false);
log(`의원 ${rawMembers.length}명`);
need('의원', rawMembers[0], ['HG_NM', 'POLY_NM', 'ORIG_NM', 'MONA_CD', 'REELE_GBN_NM', 'CMITS']);
if (rawMembers.length < 250) throw new Error(`의원 수가 ${rawMembers.length}명뿐이라 저장을 중단합니다.`);
const nameCount = {}; rawMembers.forEach(m => nameCount[m.HG_NM] = (nameCount[m.HG_NM] || 0) + 1);
const homonyms = Object.keys(nameCount).filter(n => nameCount[n] > 1);
const byName = Object.fromEntries(rawMembers.filter(m => nameCount[m.HG_NM] === 1).map(m => [m.HG_NM, m.MONA_CD]));
const stats = {};
rawMembers.forEach(m => stats[m.MONA_CD] = { fields: {}, rep: 0, passed: 0, inCmit: 0, cmitBills: 0, y: 0, n: 0, a: 0, x: 0, recent: [] });
const cmitsOf = m => String(m.CMITS || m.CMIT_NM || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
const codeToM = Object.fromEntries(rawMembers.map(m => [m.MONA_CD, m]));

// 2. 대표발의 법안
log('법안 목록 받는 중');
const NOW = Date.now(), PAIRS = {};
const bills = await getAll(API.bills, { AGE }, false);
log(`법안 ${bills.length}건, 항목: ${Object.keys(bills[0] || {}).join(',')}`);
need('법안', bills[0], ['BILL_ID', 'BILL_NAME', 'PROC_RESULT', 'COMMITTEE', 'PROPOSE_DT']);
let unmatched = 0, homonymDropped = 0; const unmatchedNames = {};
for (const b of bills) {
  // 공동 대표발의는 대표발의자 모두에게 1건씩 센다
  const names = String(b.RST_PROPOSER || '').split(/[,，]/).map(n => n.trim()).filter(Boolean);
  const codes = new Set();
  if (b.RST_MONA_CD && stats[b.RST_MONA_CD]) codes.add(b.RST_MONA_CD);
  for (const n of names) { if (names.length > 1 || !codes.size) { if (byName[n]) codes.add(byName[n]); else if (nameCount[n] > 1 && !codes.size) homonymDropped++; } }
  if (!codes.size) { if (!names.some(n => nameCount[n] > 1)) { unmatched++; const n = names.join(','); unmatchedNames[n] = (unmatchedNames[n] || 0) + 1; } continue; }
  b._codes = [...codes];
  const coNames = String(b.PUBL_PROPOSER || '').split(/[,，]/).map(n => n.trim()).filter(n => n && !names.includes(n));
  const endDt = b.PROC_DT || b.LAW_PROC_DT || b.CMT_PROC_DT || '', days = PASS.test(b.PROC_RESULT || '') && b.PROPOSE_DT && endDt ? Math.round((Date.parse(endDt) - Date.parse(b.PROPOSE_DT)) / 864e5) : null;
  for (const code of codes) {
    const s = stats[code]; s.rep++;
    if (/원안가결|수정가결/.test(b.PROC_RESULT || '')) s.direct = (s.direct || 0) + 1;
    else if (/대안반영|수정안반영/.test(b.PROC_RESULT || '')) s.merged = (s.merged || 0) + 1;
    if (days != null && days >= 0) (s.days = s.days || []).push(days);
    if (coNames.length) { const my = codeToM[code].POLY_NM, known = coNames.map(n => byName[n]).filter(Boolean); if (known.length) { s.coBase = (s.coBase || 0) + 1; if (known.some(c => { const p = codeToM[c].POLY_NM; return p !== my && p !== '무소속'; })) s.coCross = (s.coCross || 0) + 1; } }
    if (PASS.test(b.PROC_RESULT || '')) s.passed++;
    for (const f of fieldsOf(b.BILL_NAME || '')) { const x = s.fields[f] = s.fields[f] || { r: 0, p: 0 }; x.r++; if (PASS.test(b.PROC_RESULT || '')) x.p++; }
    { const ws = weakOf(b.BILL_NAME || ''); if (ws.length) { const w = s.weak = s.weak || { c: {}, q: new Set() }; const dt = String(b.PROPOSE_DT || ''); if (dt) w.q.add(dt.slice(0, 4) + 'Q' + Math.ceil(+dt.slice(5, 7) / 3)); for (const k of ws) { const x = w.c[k] = w.c[k] || { r: 0, p: 0 }; x.r++; if (PASS.test(b.PROC_RESULT || '')) x.p++; } } }
    if (b.COMMITTEE) { s.cmitBills++; if (cmitsOf(codeToM[code]).includes(b.COMMITTEE)) s.inCmit++; }
    s.recent.push({ n: b.BILL_NAME, d: b.PROPOSE_DT, r: b.PROC_RESULT || '계류', u: b.DETAIL_LINK || '' });
    { const age = (NOW - Date.parse(b.PROPOSE_DT || '')) / 864e5; if (age >= 0 && age <= 90) s.b90 = (s.b90 || 0) + 1; else if (age > 90 && age <= 180) s.b180 = (s.b180 || 0) + 1; }
    for (const n of coNames) { const c = byName[n]; if (!c || c === code) continue; const k = code < c ? code + '|' + c : c + '|' + code; PAIRS[k] = (PAIRS[k] || 0) + 1; }
  }
}
// 역사 관련 법안: 대표발의와 공동발의를 따로 센다. 공동발의자는 이름으로 연결하며, 동명이인은 구분할 수 없어 뺀다.
let histBills = 0;
for (const b of bills) {
  const cats = histOf(b.BILL_NAME || ''); if (!cats.length) continue; histBills++;
  const rep = new Set(b._codes || []);
  const co = new Set(String(b.PUBL_PROPOSER || '').split(/[,，]/).map(n => byName[n.trim()]).filter(c => c && !rep.has(c)));
  const passed = PASS.test(b.PROC_RESULT || '');
  for (const [code, role] of [...[...rep].map(c => [c, 'rep']), ...[...co].map(c => [c, 'co'])]) {
    const h = stats[code].hist = stats[code].hist || { c: {}, bills: [], votes: [] };
    for (const k of cats) { const x = h.c[k] = h.c[k] || { r: 0, p: 0, co: 0 }; if (role === 'rep') { x.r++; if (passed) x.p++; } else x.co++; }
    h.bills.push({ n: b.BILL_NAME, d: b.PROPOSE_DT, r: b.PROC_RESULT || '계류', u: b.DETAIL_LINK || '', role, cats });
  }
}
log(`역사 관련 법안 ${histBills}건`);
if (homonymDropped) warnings.push(`동명이인을 구분하지 못한 대표발의 법안 ${homonymDropped}건은 계산에서 뺐습니다.`);
if (unmatched) warnings.push(`대표발의자가 현직 의원이 아닌 법안 ${unmatched}건은 계산에서 뺐습니다(사직 의원, 위원장 대안 등).`);
log('연결 안 된 대표발의자 상위: ' + Object.entries(unmatchedNames).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([n, c]) => `${n || '(없음)'} ${c}`).join(', '));

// 3. 본회의 표결 (이미 받은 것은 다시 받지 않음)
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
log('표결 의안 목록 받는 중');
const voteBills = await getAll(API.voteBills, { AGE }, false);
log(`표결 의안 ${voteBills.length}건, 이미 받은 것 ${Object.keys(cache).length}건`);
need('표결 의안', voteBills[0], ['BILL_ID', 'BILL_NAME']);
let fetched = 0, incomplete = false;
for (const b of voteBills) {
  if (cache[b.BILL_ID]) continue;
  if ((Date.now() - START) / 60000 > BUDGET_MIN) { incomplete = true; break; }
  const rows = await getAll(API.votes, { AGE, BILL_ID: b.BILL_ID }); await wait(SLEEP);
  if (!rows.length) continue;
  need('의원별 표결', rows[0], ['MONA_CD', 'RESULT_VOTE_MOD']);
  const v = { y: [], n: [], a: [], x: [] };
  rows.forEach(r => { const k = VOTE[r.RESULT_VOTE_MOD]; if (k) v[k].push(r.MONA_CD); });
  cache[b.BILL_ID] = { name: b.BILL_NAME, date: b.PROC_DT || b.RGS_PROC_DT || '', url: b.LINK_URL || b.BILL_URL || '', ...v };
  if (++fetched % 20 === 0) log(`표결 ${fetched}건 받음`);
  if (fetched % 100 === 0) { mkdirSync('data', { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); }
}
for (const b of bills) { const v = cache[b.BILL_ID]; if (!v || !b._codes) continue; const cast = v.y.length + v.n.length; if (!cast) continue; for (const c of b._codes) (stats[c].voted = stats[c].voted || []).push({ id: b.BILL_ID, n: b.BILL_NAME, d: v.date, y: v.y.length, no: v.n.length }); }
mkdirSync(CACHE.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
for (const v of Object.values(cache)) for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) if (stats[c]) stats[c][k]++;
// 같은 정당 의원 절반 이상이 함께 불참한 표결은 개인 결석과 구분해 따로 계산한다. 소수 정당은 혼자 불참해도 집단처럼 보이므로 5명 이상 정당만 적용한다.
for (const v of Object.values(cache)) {
  const seated = {}, absent = {};
  for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) { const m = codeToM[c]; if (!m) continue; seated[m.POLY_NM] = (seated[m.POLY_NM] || 0) + 1; if (k === 'x') absent[m.POLY_NM] = (absent[m.POLY_NM] || 0) + 1; }
  for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) { const m = codeToM[c]; if (!m) continue;
    if (seated[m.POLY_NM] >= 5 && (absent[m.POLY_NM] || 0) / seated[m.POLY_NM] >= .5) { stats[c].groupAbsentBills = (stats[c].groupAbsentBills || 0) + 1; continue; }
    stats[c].adjTotal = (stats[c].adjTotal || 0) + 1; if (k !== 'x') stats[c].adjVoted = (stats[c].adjVoted || 0) + 1; } }

// 역사 관련 법안의 본회의 표결: 의원마다 어떻게 표결했는지 그대로 남긴다.
let histVotes = 0;
for (const [id, v] of Object.entries(cache)) {
  const cats = histOf(v.name || ''); if (!cats.length) continue; histVotes++;
  for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) { if (!stats[c]) continue; const h = stats[c].hist = stats[c].hist || { c: {}, bills: [], votes: [] };
    h.votes.push({ id, n: v.name, d: v.date, v: k, u: v.url || '', Y: v.y.length, N: v.n.length, cats }); }
}
log(`역사 관련 본회의 표결 ${histVotes}건`);
// 같은 당 다수와 다르게 표결한 비율. 찬성·반대만 비교하고, 그 당 표결자가 5명 이상이며 다수가 뚜렷한(70% 이상) 표결만 쓴다. 정당은 현재 소속 기준이다.
for (const v of Object.values(cache)) {
  const cnt = {};
  for (const k of ['y', 'n']) for (const c of v[k]) { const p = codeToM[c]?.POLY_NM; if (!p || p === '무소속') continue; (cnt[p] = cnt[p] || { y: 0, n: 0 })[k]++; }
  for (const k of ['y', 'n']) for (const c of v[k]) { const p = codeToM[c]?.POLY_NM; const n = cnt[p]; if (!n) continue; const tot = n.y + n.n; if (tot < 5 || Math.max(n.y, n.n) / tot < .7) continue;
    stats[c].dBase = (stats[c].dBase || 0) + 1; if ((n.y > n.n ? 'y' : 'n') !== k) stats[c].dDiff = (stats[c].dDiff || 0) + 1; } }

// 3-2. 국회가 공개한 의원 SNS 주소 (없어도 수집은 계속)
const snsBy = {};
try {
  const rows = await getAll('negnlnyvatsjwocar');
  log(`SNS 자료 ${rows.length}건, 항목: ${rows[0] ? Object.keys(rows[0]).join(', ') : '없음'}`);
  // 원자료에 주소가 겹쳐 적힌 경우가 있어 정리한다 (예: youtube.com/https://youtube.com/@a, youtube.com/www.youtube.com/@a, 전각 ＠)
  const ok = u => { let v = String(u || '').trim().replace(/＠/g, '@'); const i = v.lastIndexOf('http'); if (i > 0) v = v.slice(i); v = v.replace(/(youtube\.com\/)(?:www\.)?youtube\.com\//i, '$1'); return /^https?:\/\/\S+\.\S+/.test(v) ? v : null; };
  for (const r of rows) {
    const code = r.MONA_CD && stats[r.MONA_CD] ? r.MONA_CD : byName[String(r.HG_NM || '').trim()]; if (!code) continue;
    const v = { facebook: ok(r.F_URL), x: ok(r.T_URL), youtube: ok(r.Y_URL), instagram: ok(r.I_URL), blog: ok(r.B_URL) };
    snsBy[code] = Object.fromEntries(Object.entries(v).filter(([, u]) => u));
  }
} catch (e) { warnings.push(`SNS 주소를 받지 못했습니다: ${e.message}`); }

// 3-3. 세금아 세금아 어디로 갔니?: 공개 자료 (실패해도 나머지 수집은 계속)
function tripDays(v) {
  const m = String(v || '').match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\D*?(?:[~∼-]\s*(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2}))?\D*$/);
  if (!m) return { days: null, at: 0 };
  const [y, mo, d] = [+m[1], +m[2], +m[3]], at = Date.UTC(y, mo - 1, d);
  if (!m[5]) return { days: 1, at };
  const y2 = m[4] ? +m[4] : (+m[5] < mo ? y + 1 : y), end = Date.UTC(y2, +m[5] - 1, +m[6]), days = Math.round((end - at) / 864e5) + 1;
  return { days: days > 0 && days < 120 ? days : null, at };
}
const tax = { updated: new Date().toISOString(), trips: {}, tripRows: 0, tripUnmatched: 0, unmatchedNames: {}, homonymTrips: [], nabo: [], spend: [] };
try {
  const rows = await getAll('nasnutdbapnfphwyr', { UNIT_CD: '1000' + AGE });
  log(`국외활동 ${rows.length}건, 예시 일정: ${rows.slice(0, 3).map(r => r.SCH_DYS).join(' / ')}`);
  tax.tripRows = rows.length;
  for (const r of rows) {
    const { days, at } = tripDays(r.SCH_DYS);
    const names = String(r.PN || '').split(/[,，、·\s]+/).map(x => x.trim()).filter(Boolean);
    const item = { when: r.SCH_DYS || '', to: r.DSTN_NM === '목적지' ? '' : r.DSTN_NM || '', why: r.PURP_RSON || '', paid: r.EXPNS_SUPPT_INST_NM || '', report: r.REPORT_YN || '', vary: /상이/.test(r.SCH_DYS || '') };
    for (const n of names) {
      if (nameCount[n] > 1) tax.homonymTrips.push({ name: n, ...item }); // 신고 자료만으로 어느 의원인지 구분할 수 없어 합산하지 않는다
      else if (!byName[n]) { tax.tripUnmatched++; tax.unmatchedNames[n] = (tax.unmatchedNames[n] || 0) + 1; }
    }
    for (const code of new Set(names.map(n => byName[n]).filter(Boolean))) {
      const t = tax.trips[code] = tax.trips[code] || { n: 0, days: 0, unknownDays: 0, varyDays: 0, list: [] };
      t.n++; if (days == null) t.unknownDays++; else { t.days += days; if (item.vary) t.varyDays += days; }
      t.list.push({ ...item, at });
    }
  }
  // 출장 그 후: 출장 목적의 단어가 법 이름에 들어간 대표발의 법안을 출장 뒤 6개월 안에서 찾는다. 인과관계를 뜻하지 않는다.
  const STOP = /^(국제회의|국제기구|의원외교|의회외교|협력방안|대통령|정상회의|간담회|심포지움|심포지엄|세미나|민간외교|공공외교|주요국|대한민국|국회의원|위원회|참석차|한반도|교류회|경쟁력|글로벌|활성화|프로그램|산업의|대학교)$/;
  const billsBy = {}; for (const b of bills) for (const c of b._codes || []) (billsBy[c] = billsBy[c] || []).push(b);
  let matched = 0; for (const [code, t] of Object.entries(tax.trips)) for (const x of t.list) {
    const end = x.at; if (!end) continue; const words = [...new Set(String(x.why).match(/[가-힣]{3,}/g) || [])].filter(w => !STOP.test(w)); if (!words.length) continue;
    const found = (billsBy[code] || []).filter(b => { const d = Date.parse(b.PROPOSE_DT); const name = String(b.BILL_NAME || '').replace(/\s*(일부|전부)?(개정|제정|폐지)?법률안.*$/, ''); return d >= end && d <= end + 183 * 864e5 && words.some(w => name.includes(w)); });
    if (found.length) { matched++; x.after = found.slice(0, 3).map(b => ({ n: b.BILL_NAME, d: b.PROPOSE_DT, u: b.DETAIL_LINK || '' })); }
  }
  log(`출장 후 관련 법안 연결 ${matched}건`);
  const all = Object.values(tax.trips); log(`국외활동 연결 의원 ${all.length}명, 일수 미상 ${all.reduce((a, t) => a + t.unknownDays, 0)}, 이름 미연결 ${tax.tripUnmatched}(${Object.keys(tax.unmatchedNames).join(', ')}), 동명이인 ${tax.homonymTrips.length}건, 항목: ${Object.keys(rows[0] || {}).join(',')}`);
  for (const t of Object.values(tax.trips)) { t.list.sort((a, b) => b.at - a.at); t.list.forEach(x => delete x.at); }
} catch (e) { warnings.push(`국외활동 자료를 받지 못했습니다: ${e.message}`); }
try { const rows = await getAll('npsofwddayuhqhfgh'); tax.nabo = rows.sort((a, b) => String(b.REG_DATE).localeCompare(String(a.REG_DATE))).slice(0, 6).map(r => ({ d: r.REG_DATE, t: r.SUBJECT, u: r.LINK_URL })); } catch (e) { log('NABO 자료 실패: ' + e.message); }
try { const rows = await getAll('nalacaiwauxiynsxt'); log('사무처 업무추진비 항목: ' + Object.keys(rows[0] || {}).join(',')); tax.spend = rows.sort((a, b) => String(b.PRDC_YM_NM || b.PRDC_YM).localeCompare(String(a.PRDC_YM_NM || a.PRDC_YM))).slice(0, 6).map(r => ({ ym: r.PRDC_YM_NM || r.PRDC_YM, t: r.OPB_FL_NM, u: r.OPB_FL_PH })); } catch (e) { log('업무추진비 자료 실패: ' + e.message); }

// 최근 90일과 그 전 90일의 본회의 표결 참여(불참 제외 비율)
for (const v of Object.values(cache)) { const age = (NOW - Date.parse(v.date || '')) / 864e5; if (!(age >= 0 && age <= 180)) continue; const w = age <= 90 ? 'v90' : 'v180'; for (const [arr, on] of [[v.y, 1], [v.n, 1], [v.a, 1], [v.x, 0]]) for (const c of arr || []) { const s = stats[c]; if (!s) continue; const o = s[w] = s[w] || [0, 0]; o[1]++; if (on) o[0]++; } }
// 본회의 표결 연속 참여: 표결일 순서대로, 자신이 대상인 표결에 불참하지 않은 연속 횟수(현재·최장)
{ const order = Object.entries(cache).filter(([, v]) => v.date).sort((a, b) => String(a[1].date).localeCompare(String(b[1].date)) || a[0].localeCompare(b[0]));
  for (const [, v] of order) { const on = new Set([...(v.y || []), ...(v.n || []), ...(v.a || [])]); for (const c of [...on, ...(v.x || [])]) { const s = stats[c]; if (!s) continue; if (on.has(c)) { s.streak = (s.streak || 0) + 1; if (s.streak > (s.best || 0)) s.best = s.streak; } else s.streak = 0; } } }
// 공동발의 연결망: 의원 쌍별 함께 낸 법안 수
{ const party = c => codeToM[c]?.POLY_NM || ''; const mat = {}, top = {};
  for (const [k, n] of Object.entries(PAIRS)) { const [a, b] = k.split('|'); const pa = party(a), pb = party(b); const mk = [pa, pb].sort().join('|'); mat[mk] = (mat[mk] || 0) + n;
    for (const [x, y] of [[a, b], [b, a]]) (top[x] = top[x] || []).push([y, n, party(x) !== party(y) && party(x) !== '무소속' && party(y) !== '무소속' ? 1 : 0]); }
  const per = Object.fromEntries(Object.entries(top).map(([c, l]) => { l.sort((p, q) => q[1] - p[1]); return [c, { cross: l.filter(x => x[2]).slice(0, 6).map(x => [x[0], x[1]]), same: l.filter(x => !x[2]).slice(0, 4).map(x => [x[0], x[1]]), partners: l.length, crossPartners: l.filter(x => x[2]).length }]; }));
  const edges = Object.entries(PAIRS).filter(([k, n]) => { const [a, b] = k.split('|'); return n >= 8 && party(a) !== party(b); }).sort((p, q) => q[1] - p[1]).slice(0, 400).map(([k, n]) => [...k.split('|'), n]);
  mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/network.json`, JSON.stringify({ updated: new Date().toISOString(), matrix: mat, per, edges })); }
// 4. 화면용 자료
const members = rawMembers.map(m => {
  const s = stats[m.MONA_CD], voted = s.y + s.n + s.a, total = voted + s.x;
  s.recent.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const median = a => { if (!a?.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  const impact = { direct: s.direct || 0, merged: s.merged || 0, days: median(s.days), daysN: s.days?.length || 0, coBase: s.coBase || 0, coCross: s.coCross || 0, voted: (s.voted || []).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 8), votedN: s.voted?.length || 0, yes: s.voted?.length ? pct(s.voted.reduce((t, v) => t + v.y, 0), s.voted.reduce((t, v) => t + v.y + v.no, 0)) : null };
  const hist = s.hist ? { c: s.hist.c, bills: s.hist.bills.sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 30), billsN: s.hist.bills.length, votes: s.hist.votes.sort((a, b) => String(b.d).localeCompare(String(a.d))) } : null;
  return { hist, weak: s.weak ? { c: s.weak.c, q: s.weak.q.size } : null, impact, fields: s.fields, sns: snsBy[m.MONA_CD] || {}, id: m.MONA_CD, name: m.HG_NM, hanja: m.HJ_NM || '', party: m.POLY_NM, area: m.ORIG_NM, type: m.ELECT_GBN_NM || '', terms: m.REELE_GBN_NM, role: m.JOB_RES_NM || '', cmits: cmitsOf(m), tel: m.TEL_NO || '', web: m.HOMEPAGE || '',
    dBase: s.dBase || 0, dDiff: s.dDiff || 0, dissent: (s.dBase || 0) >= 100 ? pct(s.dDiff || 0, s.dBase) : null, voteTotal: total, voteRate: pct(voted, total), voteAdj: pct(s.adjVoted || 0, s.adjTotal || 0), groupBills: s.groupAbsentBills || 0, rep: s.rep, passRate: s.rep >= 5 ? pct(s.passed, s.rep) : null, passed: s.passed, focus: s.cmitBills >= 5 ? pct(s.inCmit, s.cmitBills) : null, y: s.y, n: s.n, a: s.a, x: s.x, streak: s.streak || 0, best: s.best || 0, b90: s.b90 || 0, b180: s.b180 || 0, v90: s.v90?.[1] >= 5 ? pct(s.v90[0], s.v90[1]) : null, v180: s.v180?.[1] >= 5 ? pct(s.v180[0], s.v180[1]) : null, recent: s.recent.slice(0, 10) };
});
// 표결 궁합: 찬반이 실제로 갈린 최근 의안을 규칙으로만 고른다(사람이 고르지 않음)
const quiz = Object.entries(cache).map(([id, v]) => ({ id, ...v, cast: v.y.length + v.n.length })).filter(v => v.cast >= 100 && Math.min(v.y.length, v.n.length) / v.cast >= .15)
  .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(v => ({ id: v.id, name: v.name, date: v.date, url: v.url, y: v.y, n: v.n }));
if (incomplete) warnings.push(`본회의 표결 ${Object.keys(cache).length}/${voteBills.length}건까지만 받았습니다. 표결 수치는 다음 수집 때 더 정확해집니다.`);
if (quiz.length < 10) warnings.push(`찬반이 갈린 의안이 ${quiz.length}건뿐이라 궁합 문항이 적습니다.`);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/members.json`, JSON.stringify(members));
writeFileSync(`${OUT}/quiz.json`, JSON.stringify(quiz));
writeFileSync(`${OUT}/tax.json`, JSON.stringify(tax));
writeFileSync(`${OUT}/history.json`, JSON.stringify(Object.fromEntries(Object.entries(HIST).map(([k, [n, re]]) => [k, { name: n, words: re.source.split('|') }]))));
writeFileSync(`${OUT}/weak.json`, JSON.stringify(Object.fromEntries(Object.entries(WEAK).map(([k, [n, re]]) => [k, { name: n, words: re.source.split('|') }]))));
writeFileSync(`${OUT}/fields.json`, JSON.stringify(Object.fromEntries(Object.entries(FIELDS).map(([k, [n, re]]) => [k, { name: n, words: re.source.split('|') }]))));
{ const un = {}; let hit = 0; for (const b of bills) { if (fieldsOf(b.BILL_NAME || '').length) hit++; else { const n = String(b.BILL_NAME || '').split(' ')[0]; un[n] = (un[n] || 0) + 1; } }
  log(`생활 분야 분류: ${hit}/${bills.length}건 (${Math.round(hit / bills.length * 100)}%). 미분류 상위: ` + Object.entries(un).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n, c]) => `${n} ${c}`).join(', ')); }
// 본회의 표결의 합의 정도: 찬성이 투표한 의원의 3분의 2 이상이면 '넓은 합의', 적은 쪽이 15% 이상이면 '찬반이 갈림'
const consensus = { total: 0, wide: 0, split: 0 }; for (const v of Object.values(cache)) { const cast = (v.y?.length || 0) + (v.n?.length || 0); if (cast < 100) continue; consensus.total++; if (v.y.length / cast >= 2 / 3) consensus.wide++; if (Math.min(v.y.length, v.n.length) / cast >= .15) consensus.split++; }
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ updated: new Date().toISOString(), age: AGE, members: members.length, bills: bills.length, voteBills: Object.keys(cache).length, voteBillsTotal: voteBills.length, consensus, incomplete, warnings }, null, 1));
console.log(`완료: 의원 ${members.length}명, 법안 ${bills.length}건, 표결 의안 ${Object.keys(cache).length}건 (이번 ${fetched}건)`);
warnings.forEach(w => console.log('주의:', w));
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `incomplete=${incomplete}\n`, { flag: 'a' });
