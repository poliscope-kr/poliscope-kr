// '대통령 뭐하노': 현 정부가 국회에 낸 법률안(제안자 = 정부)과 처리 결과를 모은다.
// 자료: 열린국회정보 '의안 심사정보(BILLJUDGE)' + '본회의 처리안건(nkalemivaqmoibxro)'. 평가는 하지 않고 기록만 모은다.
import { writeFileSync } from 'node:fs';
const KEY = process.env.ASSEMBLY_API_KEY, BASE = process.env.ASSEMBLY_BASE || 'https://open.assembly.go.kr/portal/openapi';
const OUT = process.env.OUT_DIR || 'docs/data', AGE = process.env.ASSEMBLY_AGE || '22', SLEEP = Number(process.env.SLEEP_MS ?? 200);
const SINCE = process.env.GOV_SINCE || '2025-06-04'; // 이재명 정부 출범일
if (!KEY) { console.log('키가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));

async function page(id, params, p) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: p, pSize: 100, ...params }), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (i === 4) throw new Error(`${id}: ${e.cause?.code || e.message}`); await wait(4000 * (i + 1)); }
  }
}
async function getAll(id, params) {
  const rows = [];
  for (let p = 1; p < 2000; p++) {
    const j = await page(id, params, p);
    if (j.RESULT) { if (j.RESULT.CODE === 'INFO-200') return rows; throw new Error(`${id} 오류: ${j.RESULT.CODE} ${j.RESULT.MESSAGE}`); }
    const body = j[id]; if (!body) throw new Error(`${id} 응답 형식이 다릅니다: ${Object.keys(j)}`);
    const res = body[0].head[1]?.RESULT; if (res && res.CODE !== 'INFO-000') { if (res.CODE === 'INFO-200') return rows; throw new Error(`${id} 오류: ${res.CODE}`); }
    const total = Number(body[0].head[0].list_total_count), got = body[1]?.row || [];
    rows.push(...got);
    if (!got.length || rows.length >= total) return rows;
    await wait(SLEEP);
  }
  return rows;
}

// 1. 의안 심사정보에서 정부 제출 법률안을 고른다. 대수 표기가 '제22대'인지 '22'인지 문서마다 달라 둘 다 시도한다.
let judge = [];
for (const era of [`제${AGE}대`, AGE, `${AGE}대`]) {
  try { judge = await getAll('BILLJUDGE', { ERACO: era }); } catch (e) { console.log(`ERACO=${era}: ${e.message}`); }
  if (judge.length) { console.log(`의안 심사정보 ${judge.length}건 (ERACO=${era}), 항목: ${Object.keys(judge[0]).join(',')}`); break; }
}
if (!judge.length) throw new Error('의안 심사정보를 받지 못했습니다.');
const kinds = {}; judge.forEach(r => kinds[r.PPSR_KIND] = (kinds[r.PPSR_KIND] || 0) + 1);
console.log('제안자 구분:', JSON.stringify(kinds));
const isLaw = n => /법률안|법안$|법안\(/.test(n || '');
const gov = judge.filter(r => r.PPSR_KIND === '정부' && isLaw(r.BILL_NM) && String(r.PPSL_DT || '') >= SINCE);

// 2. 본회의 처리 결과와 찬반 수
let plen = [];
try { plen = await getAll('nkalemivaqmoibxro', { AGE }); console.log(`본회의 처리안건 ${plen.length}건, 항목: ${Object.keys(plen[0] || {}).join(',')}`); }
catch (e) { console.log('본회의 처리안건 실패: ' + e.message); }
const byId = Object.fromEntries(plen.map(r => [r.BILL_ID, r]));

const status = (b, p) => {
  const pr = p?.PROC_RESULT_CD || '', cr = b.JRCMIT_PROC_RSLT || '';
  if (/가결/.test(pr)) return 'passed';
  if (/부결/.test(pr)) return 'rejected';
  if (/대안반영|수정안반영/.test(cr + pr)) return 'merged';
  if (/철회/.test(cr + pr)) return 'withdrawn';
  if (/폐기/.test(cr + pr)) return 'discarded';
  if (b.JRCMIT_PROC_DT) return 'cmit';
  return 'pending';
};
const bills = gov.map(b => {
  const p = byId[b.BILL_ID];
  return { id: b.BILL_ID, n: b.BILL_NM, d: b.PPSL_DT, c: b.JRCMIT_NM || '', cd: b.JRCMIT_PROC_DT || '', cr: b.JRCMIT_PROC_RSLT || '',
    pd: p?.RGS_PROC_DT || '', pr: p?.PROC_RESULT_CD || '', y: +p?.YES_TCNT || null, no: +p?.NO_TCNT || null, ab: +p?.BLANK_TCNT || null,
    s: status(b, p), u: b.LINK_URL || p?.LINK_URL || '' };
}).sort((a, b) => String(b.d).localeCompare(String(a.d)));
const cnt = {}; bills.forEach(b => cnt[b.s] = (cnt[b.s] || 0) + 1);
writeFileSync(`${OUT}/gov.json`, JSON.stringify({ updated: new Date().toISOString(), since: SINCE, total: bills.length, status: cnt, bills }));
console.log(`정부 제출 법률안(${SINCE} 이후) ${bills.length}건, 상태: ${JSON.stringify(cnt)}`);
