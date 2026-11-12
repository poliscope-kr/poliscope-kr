// 국회 회의록(예결위·국토교통위)에서 '세금은 어디로 샜나'의 사업 이름이 나온 곳을 찾아
// 그 대목에서 발언한 의원과 회의록 링크를 모은다. 발언의 옳고 그름은 판단하지 않는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const KEY = process.env.ASSEMBLY_API_KEY, BASE = 'https://open.assembly.go.kr/portal/openapi', OUT = 'docs/data';
const LIMIT = Number(process.env.LIMIT || 0), BUDGET = Date.now() + Number(process.env.MINUTES_MS || 50 * 60e3);
if (!KEY) { console.log('키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function api(id, params, p = 1) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: p, pSize: 100, ...params }), { signal: AbortSignal.timeout(30000) }); return await r.json(); }
    catch (e) { await wait(3000 * (i + 1)); }
  }
  return {};
}
async function all(id, params) {
  const rows = [];
  for (let p = 1; p < 50; p++) { const j = await api(id, params, p), b = j[id]; if (!b) { if (p === 1) console.log(id, JSON.stringify(j).slice(0, 200)); break; } const got = b[1]?.row || []; rows.push(...got); if (!got.length || rows.length >= Number(b[0].head[0].list_total_count)) break; await wait(200); }
  return rows;
}
// 찾을 사업 이름: 사례·추진 중 사업 + 열린재정 새 공항·철도 사업
const W = JSON.parse(readFileSync(`${OUT}/waste.json`, 'utf8')), F = existsSync(`${OUT}/fiscal.json`) ? JSON.parse(readFileSync(`${OUT}/fiscal.json`, 'utf8')) : { items: [] };
const norm = s => s.replace(/\s+/g, '').replace(/[()·\-–]/g, '');
const ALIAS = { '가덕도신공항': ['가덕도신공항', '가덕신공항'], '대구경북 통합신공항': ['대구경북신공항', '대구경북통합신공항', 'TK신공항', '통합신공항'], '새만금 국제공항': ['새만금국제공항', '새만금신공항', '새만금공항'], '인천 F1 그랑프리 유치': ['F1'], '양양국제공항': ['양양공항', '양양국제공항'], '무안국제공항': ['무안공항', '무안국제공항'], '울진공항': ['울진공항'], '김제공항': ['김제공항'], '경인아라뱃길': ['아라뱃길', '경인운하'], '용인경전철': ['용인경전철'], '의정부경전철': ['의정부경전철'], '부산–김해경전철': ['김해경전철', '부산김해경전철'], '새만금 세계스카우트잼버리': ['잼버리'], '평창 알펜시아': ['알펜시아'], '4대강 살리기 사업': ['4대강'], '전국 출렁다리 경쟁': ['출렁다리'] };
const TARGETS = Object.entries(ALIAS).map(([n, a]) => ({ n, a: a.map(norm) }));
for (const it of F.items || []) { const k = norm(it.n.replace(/건설.*$|건립.*$/, '')); if (k.length >= 4 && !TARGETS.some(t => t.a.includes(k))) TARGETS.push({ n: it.n, a: [k] }); }
// 의원 이름
const M = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8')), byName = {};
M.forEach(m => (byName[m.name] = byName[m.name] || []).push(m.id));
// 이미 읽은 회의록은 다시 받지 않는다
mkdirSync('data', { recursive: true });
const CACHE = 'data/minutes-cache.json', cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { done: {}, hits: [] };
// 회의록 목록: 예결위 + 국토교통위원회(전체회의)
const confs = [];
for (const e of ['제22대', '22']) { const r = await all('VCONFBUDGETCONFLIST', { ERACO: e }); if (r.length) { confs.push(...r.map(x => ({ id: x.CONF_ID, d: x.CONF_DT, c: x.CMIT_NM || '예산결산특별위원회', u: x.DOWN_URL }))); console.log('예결위 회의록', e, r.length); break; } }
for (const y of [2024, 2025, 2026]) {
  const r = await all('ncwgseseafwbuheph', { DAE_NUM: 22, COMM_NAME: '국토교통위원회', CONF_DATE: y });
  console.log('국토위 회의록', y, r.length, r[0] ? JSON.stringify(r[0]).slice(0, 300) : '');
  confs.push(...r.map(x => ({ id: x.CONF_ID || x.CONFER_NUM, d: x.CONF_DATE, c: x.COMM_NAME, t: x.TITLE, u: x.PDF_LINK_URL })));
}
const todo = confs.filter(c => c.u && c.id && !cache.done[c.id]).sort((a, b) => String(b.d).localeCompare(String(a.d)));
console.log('회의록 전체', confs.length, '새로 읽을 것', todo.length);
let n = 0;
const SPK = /^[○◯]\s*([가-힣]{2,4})\s*(위원장|위원|의원)/;
for (const c of todo) {
  if (Date.now() > BUDGET || (LIMIT && n >= LIMIT)) break; n++;
  try {
    const r = await fetch(c.u, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (n <= 2) console.log('다운로드', c.u, r.status, r.headers.get('content-type'), buf.length, buf.slice(0, 5).toString());
    if (buf.slice(0, 4).toString() !== '%PDF') { cache.done[c.id] = 'notpdf'; continue; }
    writeFileSync('/tmp/m.pdf', buf);
    const txt = execFileSync('pdftotext', ['-layout', '/tmp/m.pdf', '-'], { maxBuffer: 1 << 28 }).toString();
    const lines = txt.split('\n'); let who = null, role = null; const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i].trim(), m = L.match(SPK);
      if (m) { who = m[1]; role = m[2]; } else if (/^[○◯]/.test(L)) { who = null; }
      if (!who) continue;
      const nl = norm(L);
      for (const t of TARGETS) {
        if (!t.a.some(a => nl.includes(a))) continue;
        const key = who + '|' + t.n; if (seen.has(key)) continue; seen.add(key);
        const snip = lines.slice(Math.max(0, i - 1), i + 2).map(s => s.trim()).join(' ').replace(/^[○◯]\s*\S+\s*(위원장|위원|의원)\s*/, '').replace(/\s+/g, ' ').slice(0, 180);
        cache.hits.push({ p: t.n, who, role, ids: byName[who] || [], d: c.d, c: c.c, conf: c.id, u: c.u, s: snip });
      }
    }
    cache.done[c.id] = 1;
  } catch (e) { console.log('실패', c.id, e.message); }
  await wait(500);
}
writeFileSync(CACHE, JSON.stringify(cache));
// 사이트용 요약: 사업별로 언급한 의원(동명이인은 연결하지 않음)
const byP = {};
for (const h of cache.hits) {
  const id = h.ids.length === 1 ? h.ids[0] : null;
  (byP[h.p] = byP[h.p] || []).push({ id, who: h.who, role: h.role, d: h.d, c: h.c, u: h.u, s: h.s });
}
for (const k in byP) byP[k].sort((a, b) => String(b.d).localeCompare(String(a.d)));
writeFileSync(`${OUT}/minutes.json`, JSON.stringify({ updated: new Date().toISOString(), read: Object.keys(cache.done).length, projects: byP }));
console.log('읽은 회의록', n, '누적', Object.keys(cache.done).length, '사업 언급', cache.hits.length, Object.fromEntries(Object.entries(byP).map(([k, v]) => [k, v.length])));
