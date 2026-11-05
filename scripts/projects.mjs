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
  const rp = reports.filter(r => norm(r.RE_NAME) === key).map(r => ({ y: String(r.YEAR).slice(0, 4), t: r.REPORT_TITLE || '', u: r.PDF_DOWN_URL || '', c: r.REPORT_CLASSIFICATION_NM || '' }));
  const aw = award.filter(a => norm(a.GRP) === key && inTerm(a.YEAR)).map(a => ({ y: String(a.YEAR).slice(0, 4), d: a.DIV || '', m: money(a.PRZ_MONEY) }));
  const total = sp.reduce((t, s) => t + s.general + s.biz + s.special + s.research, 0);
  const spentYears = [...new Set(sp.filter(s => s.general + s.biz + s.special + s.research > 0).map(s => s.y))], reportYears = new Set(rp.map(r => r.y));
  const covered = spentYears.filter(y => reportYears.has(y));
  // 기록 점수: 연구의 질이 아니라 공개 기록을 본다. 집행이 없으면 보고 항목은 평가하지 않는다.
  let score = null, parts = [];
  if (spentYears.length) { const rep = covered.length / spentYears.length; const repN = Math.min(1, rp.length / (spentYears.length * 2)); const aw1 = aw.length ? 1 : 0; score = Math.round(rep * 60 + repN * 25 + aw1 * 15); parts = [['집행 연도별 보고서', Math.round(rep * 60), 60], ['보고서 분량', Math.round(repN * 25), 25], ['우수 연구단체 선정', aw1 * 15, 15]]; }
  const good = [], bad = [];
  if (aw.length) good.push(`우수 연구단체 선정 ${aw.map(a => a.y).join(', ')}`);
  if (rp.length) good.push(`연구 보고서 ${rp.length}건 공개`);
  const miss = spentYears.filter(y => !reportYears.has(y)); if (miss.length) bad.push(`${miss.join(', ')}년 집행 기록은 있으나 공개 보고서를 찾지 못함`);
  if (!sp.length) bad.push('집행 내역을 찾지 못함 (단체 이름 불일치일 수 있음)');
  return { name: g.RE_NAME, topic: g.RE_TOPIC_NAME || '', goal: String(g.RE_OBJECTIVE || '').slice(0, 500), lead: namesIn(g.MAIN_MEM), head: namesIn(g.RE_MEM), crew: namesIn(g.OBJ_MEM), leadText: g.MAIN_MEM || '', count: g.MEMBER_CNT || '', url: g.LINK_URL || '', spend: sp, total, reports: rp.slice(0, 12), reportCount: rp.length, awards: aw, score, parts, good, bad };
});
const per = {};
for (const g of groups) { const ids = new Set([...g.lead.map(n => idOf[n]), ...g.head.map(n => idOf[n])]); for (const id of ids) { (per[id] = per[id] || []).push(g.name); } for (const n of g.crew) { const id = idOf[n]; if (!ids.has(id)) ((per['c' + id] = per['c' + id] || [])).push(g.name); } }
const unmatchedSpend = spend.filter(s => inTerm(s.YEAR) && !groups.some(g => norm(g.name) === norm(s.ORG_NM))).length;
console.log(`연구단체 ${groups.length}개, 점수 있음 ${groups.filter(g => g.score != null).length}, 집행 합계 ${groups.reduce((t, g) => t + g.total, 0)}, 이름 불일치 집행 ${unmatchedSpend}, 대표 연결 ${groups.filter(g => g.lead.length).length}, 구성 평균 ${Math.round(groups.reduce((t, g) => t + g.crew.length, 0) / (groups.length || 1))}`);
if (!groups.length) { console.log('자료가 없어 저장하지 않습니다.'); process.exit(0); }
writeFileSync(`${OUT}/projects.json`, JSON.stringify({ updated: new Date().toISOString(), groups, per, ids: idOf }));
