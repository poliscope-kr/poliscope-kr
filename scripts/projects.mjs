// 의원이 직접 수행하는 세금 사업: 국회의원 연구단체의 등록·집행·보고서·우수 선정 기록을 모아 기록 점수를 계산한다.
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.ASSEMBLY_API_KEY, BASE = process.env.ASSEMBLY_BASE || 'https://open.assembly.go.kr/portal/openapi', OUT = process.env.OUT_DIR || 'docs/data', AGE = process.env.ASSEMBLY_AGE || '22', SLEEP = Number(process.env.SLEEP_MS ?? 200);
if (!KEY) { console.log('키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function all(id, params = {}) {
  const rows = [];
  for (let p = 1; p < 200; p++) {
    let j; for (let i = 0; i < 5; i++) { try { const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: p, pSize: 100, ...params }), { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); j = await r.json(); break; } catch (e) { if (i === 4) throw new Error(`${id}: ${e.cause?.code || e.message}`); await wait(4000 * (i + 1)); } }
    if (j.RESULT) { if (j.RESULT.CODE === 'INFO-200') return rows; throw new Error(`${id}: ${j.RESULT.CODE} ${j.RESULT.MESSAGE}`); }
    const b = j[id]; const got = b?.[1]?.row || []; rows.push(...got); if (!got.length || rows.length >= Number(b[0].head[0].list_total_count)) return rows; await wait(SLEEP);
  }
  return rows;
}
const sample = (n, rows) => console.log(`${n}: ${rows.length}건 예시 ${JSON.stringify(rows[0] || null).slice(0, 500)}`);
const members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const cnt = {}; members.forEach(m => cnt[m.name] = (cnt[m.name] || 0) + 1);
const idOf = Object.fromEntries(members.filter(m => cnt[m.name] === 1).map(m => [m.name, m.id]));
const namesIn = s => [...new Set(String(s || '').split(/[,，、·\s/()]+/).map(x => x.replace(/의원$/, '').trim()).filter(x => idOf[x]))];
const norm = s => String(s || '').replace(/\s+/g, '').replace(/[()（）·ㆍ]/g, '');
const clean = s => String(s || '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').trim();
const rank = c => /결과/.test(c) ? 0 : /정책연구|용역/.test(c) ? 1 : /중간/.test(c) ? 2 : 3;
const money = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
let reg = await all('numwhtqhavaqssfle', { REGDAESU: AGE }); if (!reg.length) reg = await all('numwhtqhavaqssfle', { REGDAESU: `제${AGE}대` });
const reports = await all('ncrwiahparxrpodcv', { REGDAESU: AGE }).then(r => r.length ? r : all('ncrwiahparxrpodcv', { REGDAESU: `제${AGE}대` }));
const spend = await all('nipnblofawwyxdhmx'), award = await all('nvbqusufapyxesqek');
sample('등록', reg); sample('보고서', reports); sample('집행', spend); sample('우수', award);
const years = [...new Set(spend.map(s => String(s.YEAR)))].sort(); console.log('집행 연도', years.join(','), '우수 연도', [...new Set(award.map(a => String(a.YEAR)))].sort().join(','));
const START = Number(process.env.START_YEAR ?? 2024); const inTerm = y => Number(String(y).slice(0, 4)) >= START;
const groups = reg.map(g => {
  const key = norm(g.RE_NAME);
  const sp = spend.filter(s => norm(s.ORG_NM) === key && inTerm(s.YEAR)).map(s => ({ y: String(s.YEAR).slice(0, 4), general: money(s.NOR_ENTERATM), biz: money(s.BUS_GOATM), special: money(s.SPE_WORKATM), research: money(s.POLICY_RESRCH_ATM) }));
  const seen = new Set(); const rp = reports.filter(r => norm(r.RE_NAME) === key).map(r => ({ y: String(r.YEAR).slice(0, 4), t: clean(r.REPORT_TITLE), u: r.PDF_DOWN_URL || '', c: r.REPORT_CLASSIFICATION_NM || '' })).filter(r => { const k = r.u || r.t; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (rank(x.c) - rank(y.c)) || y.y.localeCompare(x.y));
  const aw = award.filter(a => norm(a.GRP) === key && inTerm(a.YEAR)).map(a => ({ y: String(a.YEAR).slice(0, 4), d: clean(a.DIV) }));
  const total = sp.reduce((t, s) => t + s.general + s.biz + s.special + s.research, 0);
  const spentYears = [...new Set(sp.filter(s => s.general + s.biz + s.special + s.research > 0).map(s => s.y))].sort();
  const researchYears = sp.filter(s => s.research > 0).map(s => s.y);
  const has = (kind, y) => rp.some(r => kind.test(r.c) && (r.y === y || Number(r.y) === Number(y) + 1));
  const RES = /결과보고서/, PLAN = /계획서/, STUDY = /정책연구|연구용역/;
  const hasRes = y => rp.some(r => RES.test(r.c) && (r.t.match(/(20\d\d)년/)?.[1] || r.y) === y);
  const resultOk = spentYears.filter(hasRes), planOk = spentYears.filter(y => rp.some(r => PLAN.test(r.c) && r.y === y)), studyOk = researchYears.filter(y => has(STUDY, y));
  // 공개 기록 점수: 연구의 질이 아니라 돈을 쓴 해에 공개 기록이 남았는지만 본다. 집행 기록이 없으면 평가하지 않는다.
  let score = null, parts = [];
  if (spentYears.length) { const r1 = resultOk.length / spentYears.length, r2 = planOk.length / spentYears.length, r3 = researchYears.length ? studyOk.length / researchYears.length : null, a1 = aw.length ? 1 : 0; const w3 = r3 == null ? 0 : 30, base = 40 + 15 + w3 + 15; score = Math.round((r1 * 40 + r2 * 15 + (r3 ?? 0) * w3 + a1 * 15) / base * 100); parts = [['결과보고서 공개', Math.round(r1 * 40), 40], ['활동계획서 공개', Math.round(r2 * 15), 15], ...(r3 == null ? [] : [['정책연구비 쓴 해의 연구 보고서', Math.round(r3 * 30), 30]]), ['우수 연구단체 선정', a1 * 15, 15]]; }
  const good = [], bad = [];
  if (aw.length) good.push(`국회 선정 수상 ${[...new Set(aw.map(a => a.y))].join(', ')}년`);
  if (resultOk.length) good.push(`결과보고서 공개 (${resultOk.join(', ')}년 집행분)`);
  const studies = rp.filter(r => STUDY.test(r.c)).length; if (studies) good.push(`정책연구·용역 보고서 ${studies}건 공개`);
  const noRes = spentYears.filter(y => !hasRes(y)); if (noRes.length) bad.push(`${noRes.join(', ')}년 집행분의 결과보고서를 찾지 못함`);
  const noStudy = researchYears.filter(y => !has(STUDY, y)); if (noStudy.length) bad.push(`${noStudy.join(', ')}년 정책연구비 집행 기록이 있으나 연구 보고서를 찾지 못함`);
  if (!sp.length) bad.push('집행 내역 없음. 2026년 이후 등록 단체이거나 이름 불일치일 수 있어 평가하지 않음');
  return { name: g.RE_NAME, topic: g.RE_TOPIC_NAME || '', goal: clean(g.RE_OBJECTIVE).slice(0, 500), lead: namesIn(g.MAIN_MEM), head: namesIn(g.RE_MEM), crew: namesIn(g.OBJ_MEM), leadText: g.MAIN_MEM || '', count: g.MEMBER_CNT || '', url: g.LINK_URL || '', spend: sp, total, reports: rp.slice(0, 15), reportCount: rp.length, awards: aw, score, parts, good, bad };
});
const per = {};
for (const g of groups) { const ids = new Set([...g.lead.map(n => idOf[n]), ...g.head.map(n => idOf[n])]); for (const id of ids) { (per[id] = per[id] || []).push(g.name); } for (const n of g.crew) { const id = idOf[n]; if (!ids.has(id)) ((per['c' + id] = per['c' + id] || [])).push(g.name); } }
const unmatchedSpend = spend.filter(s => inTerm(s.YEAR) && !groups.some(g => norm(g.name) === norm(s.ORG_NM))).length;
console.log('점수분포', JSON.stringify(groups.map(g => g.score).filter(x => x != null).sort((a, b) => a - b)));
console.log(`연구단체 ${groups.length}개, 점수 있음 ${groups.filter(g => g.score != null).length}, 집행 합계 ${groups.reduce((t, g) => t + g.total, 0)}, 이름 불일치 집행 ${unmatchedSpend}, 대표 연결 ${groups.filter(g => g.lead.length).length}, 구성 평균 ${Math.round(groups.reduce((t, g) => t + g.crew.length, 0) / (groups.length || 1))}`);
// 의원실이 주최한 정책 세미나·토론회와 지역현안 토론회. 비용이 공개되지 않아 점수에는 넣지 않는다.
const events = {};
const addEv = (id, e) => { (events[id] = events[id] || []).push(e); };
const nowY = new Date().getFullYear();
for (let y = START; y <= nowY; y++) {
  try { const rows = await all('nbqbmccpamsvwebkn', { HOST_DT: String(y) }); console.log(`세미나 ${y}: ${rows.length}건`);
    for (const r of rows) { const hosts = [...String(r.HOST_INS_NAME || '').matchAll(/([가-힣]{2,5})\s*의원/g)].map(x => x[1]); for (const n of new Set(hosts)) if (idOf[n]) addEv(idOf[n], { d: String(r.HOST_DT || '').slice(0, 10), t: clean(r.TITLE), u: r.DETAIL_VIEW_URL || '', k: '세미나' }); }
  } catch (e) { console.log('세미나 실패', y, e.message); }
}
try { for (const r of await all('nyioaasianxlkcqxs')) { const id = idOf[String(r.ETC_CHAR7 || '').trim()]; if (id) addEv(id, { d: String(r.ETC_CHAR1 || '').replace(/-/g, '.'), t: clean(r.ARTICLE_TITLE), u: r.LINK_URL || '', k: '지역현안 토론회' }); } } catch (e) { console.log('토론회 실패', e.message); }
const seen2 = {}; for (const [id, list] of Object.entries(events)) { const u = new Map(); list.forEach(e => u.set(e.d + e.t, e)); const a = [...u.values()].sort((x, y) => y.d.localeCompare(x.d)); seen2[id] = { n: a.length, list: a.slice(0, 8) }; }
console.log(`행사 연결 의원 ${Object.keys(seen2).length}명, 최다 ${Math.max(0, ...Object.values(seen2).map(x => x.n))}건`);
if (!groups.length) { console.log('자료가 없어 저장하지 않습니다.'); process.exit(0); }
writeFileSync(`${OUT}/projects.json`, JSON.stringify({ updated: new Date().toISOString(), groups, per, events: seen2, spendUnmatched: unmatchedSpend }));
