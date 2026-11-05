// '이 법, 그 후': 최근 본회의 표결 법안의 진행 과정, 표결, 제안 이유를 모은다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const KEY = process.env.ASSEMBLY_API_KEY, BASE = process.env.ASSEMBLY_BASE || 'https://open.assembly.go.kr/portal/openapi';
const OUT = process.env.OUT_DIR || 'docs/data', VOTES = process.env.CACHE_FILE || 'data/votes-cache.json', CACHE = process.env.LAWS_CACHE || 'data/laws-cache.json';
const N = Number(process.env.LAWS_N ?? 150), SLEEP = Number(process.env.SLEEP_MS ?? 200);
if (!KEY) { console.log('키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function one(id, params) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: 1, pSize: 5, ...params }), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); if (j.RESULT?.CODE === 'INFO-200') return null; if (j.RESULT) throw new Error(j.RESULT.CODE);
      return j[id]?.[1]?.row?.[0] || null;
    } catch (e) { if (i === 3) throw new Error(`${id}: ${e.cause?.code || e.message}`); await wait(3000 * (i + 1)); }
  }
}
const votes = JSON.parse(readFileSync(VOTES, 'utf8')), members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const fields = JSON.parse(readFileSync(`${OUT}/fields.json`, 'utf8'));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const party = Object.fromEntries(members.map(m => [m.id, m.party]));
const recent = Object.entries(votes).sort((a, b) => String(b[1].date).localeCompare(String(a[1].date))).slice(0, N);
let got = 0, failed = 0, first = true;
for (const [id] of recent) {
  const c = cache[id];
  if (c && (c.prom || Date.now() - Date.parse(c.at) < 7 * 864e5)) continue; // 공포 전 법안은 일주일마다 다시 확인
  try {
    const d = await one('BILLINFODETAIL', { BILL_ID: id }); await wait(SLEEP);
    if (first && d) { console.log('상세 항목:', Object.keys(d).join(',')); first = false; }
    if (!d) continue;
    const s = d.BILL_NO ? await one('BPMBILLSUMMARY', { BILL_NO: d.BILL_NO }) : null; await wait(SLEEP);
    cache[id] = { at: new Date().toISOString(), proposer: d.PPSR || '', kind: d.PPSR_KIND || '', steps: [['발의', d.PPSL_DT], ['위원회 회부', d.JRCMIT_CMMT_DT], ['위원회 처리', d.JRCMIT_PROC_DT], ['법사위 처리', d.LAW_PROC_DT], ['본회의 의결', d.RGS_RSLN_DT], ['정부 이송', d.GVRN_TRSF_DT], ['공포', d.PROM_DT]].filter(([, v]) => v), result: d.RGS_CONF_RSLT || '', prom: d.PROM_DT || '', promName: d.PROM_LAW_NM || '', cmit: d.JRCMIT_NM || '', summary: String(s?.SUMMARY || '').replace(/\s+/g, ' ').trim().slice(0, 1500) };
    got++;
  } catch (e) { failed++; console.log(e.message); if (failed > 10) break; }
}
writeFileSync(CACHE, JSON.stringify(cache));
const laws = recent.filter(([id]) => cache[id]).map(([id, v]) => {
  const byParty = {};
  for (const k of ['y', 'n', 'a', 'x']) for (const c of v[k]) { const p = party[c]; if (!p) continue; (byParty[p] = byParty[p] || { y: 0, n: 0, a: 0, x: 0 })[k]++; }
  const fs = Object.entries(fields).filter(([, f]) => f.words.some(w => new RegExp(w).test(v.name))).map(([k]) => k);
  return { id, name: v.name, date: v.date, url: v.url, y: v.y, n: v.n, a: v.a, x: v.x, byParty, fields: fs, ...cache[id] };
});
writeFileSync(`${OUT}/laws.json`, JSON.stringify({ updated: new Date().toISOString(), laws }));
console.log(`법안 상세 완료: ${laws.length}건 (이번 ${got}건, 실패 ${failed}건), 제안 이유 있는 법안 ${laws.filter(l => l.summary).length}건`);
