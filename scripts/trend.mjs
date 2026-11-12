// 추이 기록: 하루 한 번 주요 지표를 docs/data/trend.json에 쌓는다(같은 날짜는 덮어씀). 몇 주가 쌓이면 사이트에서 변화선을 그린다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const OUT = process.env.OUT_DIR || 'docs/data';
const j = (f, d) => { try { return JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8')); } catch { return d; } };
const M = j('members.json', []), META = j('meta.json', {}), NW = j('news.json', { members: {} }).members || {}, IG = j('instagram.json', { members: {} }).members || {}, LIFE = j('life.json', {});
if (!M.length) { console.log('의원 자료가 없어 건너뜁니다.'); process.exit(0); }
const r1 = v => v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10;
const avg = a => { const x = a.filter(v => v != null); return x.length ? x.reduce((p, q) => p + q, 0) / x.length : null; };
const lifePassed = m => Object.entries(m.fields || {}).reduce((t, [k, x]) => t + (k === 'tax' ? 0 : x.p || 0), 0);
function stat(ms) {
  const nw = {}; ms.forEach(m => { const t = NW[m.id]?.totals; if (t) for (const [k, v] of Object.entries(t)) if (k !== 'photo') nw[k] = (nw[k] || 0) + v; });
  const nT = Object.values(nw).reduce((a, b) => a + b, 0), share = k => nT ? (nw[k] || 0) / nT * 100 : null;
  const posts = ms.flatMap(m => IG[m.id]?.posts || []), ps = f => posts.length ? posts.filter(f).length / posts.length * 100 : null;
  const cb = ms.reduce((t, m) => t + (m.impact?.coBase || 0), 0), cc = ms.reduce((t, m) => t + (m.impact?.coCross || 0), 0);
  return { n: ms.length, policy: r1(share('policy')), fight: r1(share('fight')), case: r1(share('case')), vote: r1(avg(ms.map(m => m.voteAdj))), rep: r1(avg(ms.map(m => m.rep))), life: r1(avg(ms.map(lifePassed))), cross: r1(cb ? cc / cb * 100 : null),
    igLife: r1(ps(p => p.c.includes('life') || p.c.includes('work'))), igFight: r1(ps(p => p.c.includes('fight'))) };
}
const parties = {}; [...new Set(M.map(m => m.party))].forEach(p => { const ms = M.filter(m => m.party === p); if (ms.length >= 3 && p !== '무소속') parties[p] = stat(ms); });
const b = LIFE.base || {}, T = LIFE.total || 0, cs = META.consensus;
const snap = { d: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10), all: { ...stat(M), passRate: r1(T ? ((b.passed || 0) + (b.merged || 0)) / T * 100 : null), wide: r1(cs?.total ? cs.wide / cs.total * 100 : null), bills: META.bills || null }, parties };
const tr = j('trend.json', { since: snap.d, snaps: [] });
tr.snaps = tr.snaps.filter(s => s.d !== snap.d).concat(snap).sort((a, c) => a.d.localeCompare(c.d)).slice(-730);
writeFileSync(`${OUT}/trend.json`, JSON.stringify(tr));
console.log(`추이 기록: ${snap.d} (모두 ${tr.snaps.length}일)`);
