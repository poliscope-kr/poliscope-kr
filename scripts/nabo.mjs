// 국회예산정책처(NABO) 공식 분석 보고서 목록: 결산 분석 · 재정사업 평가 · 지방재정 · 재정동향 이슈
// 자료: 열린국회정보(기존 ASSEMBLY_API_KEY). 보고서 제목·발간일·링크만 모으고 평가는 하지 않는다.
import { writeFileSync } from 'node:fs';
const KEY = process.env.ASSEMBLY_API_KEY, BASE = 'https://open.assembly.go.kr/portal/openapi', OUT = process.env.OUT_DIR || 'docs/data';
if (!KEY) { console.log('키가 없어 건너뜁니다.'); process.exit(0); }
const SETS = [['settle', '결산 분석', 'negjnychalvyrcifv'], ['eval', '재정사업 평가', 'nzjvrirbauqmffblj'], ['local', '지방재정', 'naqdzohuagtisumcw'], ['issue', '재정동향 이슈', 'nsjmwljyauxvdodgh']];
const wait = ms => new Promise(r => setTimeout(r, ms));
async function page(id, p) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: p, pSize: 100 }), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json();
    } catch (e) { if (i === 3) throw e; await wait(3000 * (i + 1)); }
  }
}
const reports = [], stat = {};
for (const [k, name, id] of SETS) {
  const rows = [];
  try {
    for (let p = 1; p <= 10; p++) {
      const j = await page(id, p), body = j[id];
      if (!body) { console.log(name, '응답:', JSON.stringify(j).slice(0, 200)); break; }
      const got = body[1]?.row || []; rows.push(...got);
      if (!got.length || rows.length >= Number(body[0].head[0].list_total_count)) break;
      await wait(300);
    }
  } catch (e) { console.log(name, '실패:', e.message); }
  stat[k] = rows.length;
  for (const r of rows) {
    const t = (r.SUBJECT || '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(), d = String(r.REG_DATE || '').slice(0, 10).replace(/\./g, '-');
    if (t) reports.push({ k, t, d, dep: r.DEPARTMENT_NAME || '', u: r.LINK_URL || '' });
  }
}
reports.sort((a, b) => b.d.localeCompare(a.d));
const SETN = Object.fromEntries(SETS.map(([k, n]) => [k, n]));
writeFileSync(`${OUT}/nabo.json`, JSON.stringify({ updated: new Date().toISOString(), sets: SETN, reports: reports.slice(0, 400) }));
console.log('NABO 보고서', stat, '저장', Math.min(400, reports.length));
