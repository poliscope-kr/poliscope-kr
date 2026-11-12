// '대통령 국정 운영 현황': 현 정부가 국회에 낸 법률안(제안자 = 정부)과 처리 결과를 모은다.
// 자료: 열린국회정보 '의안정보 통합(TVBPMBILL11)' + '본회의 표결 의안(ncocpgfiaoituanbr)'. 평가는 하지 않고 기록만 모은다.
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

// 1. 22대 의안 전체(의안정보 통합)에서 정부가 낸 법률안을 고른다.
const all = await getAll('TVBPMBILL11', { AGE });
if (all.length < 5000) throw new Error(`의안 목록이 ${all.length}건뿐이라 저장을 중단합니다.`);
const kinds = {}; all.forEach(r => kinds[r.PROPOSER_KIND] = (kinds[r.PROPOSER_KIND] || 0) + 1);
console.log(`의안 ${all.length}건, 제안자 구분: ${JSON.stringify(kinds)}`);
const isLaw = n => /법률안|법안$/.test(String(n || '').replace(/\(.*\)\s*$/, ''));
const govAll = all.filter(r => r.PROPOSER_KIND === '정부' && isLaw(r.BILL_NAME));
const gov = govAll.filter(r => String(r.PROPOSE_DT || '') >= SINCE);

// 2. 본회의 표결 찬반 수 (표결된 의안만)
let votes = [];
try { votes = await getAll('ncocpgfiaoituanbr', { AGE }); } catch (e) { console.log('본회의 표결 자료 실패: ' + e.message); }
const byId = Object.fromEntries(votes.map(r => [r.BILL_ID, r]));

const status = r => {
  const pr = r.PROC_RESULT_CD || '';
  if (/^(원안가결|수정가결)/.test(pr)) return 'passed';
  if (/반영폐기/.test(pr)) return 'merged';
  if (/부결/.test(pr)) return 'rejected';
  if (/철회/.test(pr)) return 'withdrawn';
  if (/폐기/.test(pr)) return 'discarded';
  if (r.CMT_PROC_DT || r.LAW_PROC_DT) return 'cmit';
  return 'pending';
};
const bills = gov.map(r => {
  const v = byId[r.BILL_ID];
  return { id: r.BILL_ID, n: r.BILL_NAME, d: r.PROPOSE_DT, c: r.CURR_COMMITTEE || '', cpd: r.CMT_PRESENT_DT || '', cd: r.CMT_PROC_DT || '', pr: r.PROC_RESULT_CD || '', pd: r.PROC_DT || '',
    y: v ? +v.YES_TCNT : null, no: v ? +v.NO_TCNT : null, ab: v ? +v.BLANK_TCNT : null, s: status(r), u: r.LINK_URL || '' };
}).sort((a, b) => String(b.d).localeCompare(String(a.d)));
const prevN = govAll.length - gov.length;
// 법률안이 아닌 정부 의안(예산안·추가경정예산안·동의안 등). 의안정보 통합 자료에 없으면 본회의 표결 자료에서 찾는다.
const nonLaw = all.filter(r => r.PROPOSER_KIND === '정부' && !isLaw(r.BILL_NAME) && String(r.PROPOSE_DT || '') >= SINCE);
const other = nonLaw.map(r => { const v = byId[r.BILL_ID]; return { id: r.BILL_ID, n: r.BILL_NAME, d: r.PROPOSE_DT, pr: r.PROC_RESULT_CD || '', pd: r.PROC_DT || '', y: v ? +v.YES_TCNT : null, no: v ? +v.NO_TCNT : null, ab: v ? +v.BLANK_TCNT : null, u: r.LINK_URL || '' }; });
const seen = new Set(other.map(o => o.id));
for (const v of votes) if (!seen.has(v.BILL_ID) && /예산|기금운용계획/.test(v.BILL_NAME || '') && String(v.PROC_DT || '') >= SINCE) other.push({ id: v.BILL_ID, n: v.BILL_NAME, d: '', pr: v.PROC_RESULT_CD || '', pd: v.PROC_DT || '', y: +v.YES_TCNT, no: +v.NO_TCNT, ab: +v.BLANK_TCNT, u: v.LINK_URL || '' });
other.sort((a, b) => String(b.pd || b.d).localeCompare(String(a.pd || a.d)));
console.log(`정부 기타 의안 ${other.length}건: ` + other.slice(0, 15).map(o => `${o.pd || o.d} ${o.n} ${o.pr}`).join(' / '));
const cnt = {}; bills.forEach(b => cnt[b.s] = (cnt[b.s] || 0) + 1);
writeFileSync(`${OUT}/gov.json`, JSON.stringify({ updated: new Date().toISOString(), since: SINCE, total: bills.length, prevN, allBills: all.length, kinds, status: cnt, bills, other }));
console.log(`정부 제출 법률안(${SINCE} 이후) ${bills.length}건, 상태: ${JSON.stringify(cnt)}`);

// 3. '이 법, 나랑 무슨 상관?'·'통과할까?' 게임용: 생활 상황별 단어가 법률 이름에 든 22대 법률안(제안자 무관)
const LIFE = {
  youth: { name: '청년·취준생', words: ['청년', '최저임금', '직업안정', '직업교육', '고용보험', '취업', '구직', '국민연금'] },
  rent: { name: '전·월세 사는 사람', words: ['주택임대차', '전세사기', '임대차', '공공주택', '민간임대주택', '주거급여', '주거기본', '전세'] },
  student: { name: '대학생', words: ['고등교육', '학자금', '대학', '장학', '평생교육'] },
  worker: { name: '직장인', words: ['근로기준', '퇴직급여', '남녀고용평등', '육아휴직', '근로자', '산업안전', '소득세법', '임금채권'] },
  living: { name: '혼자 사는 사람·생활비', words: ['소비자', '전자상거래', '전기통신', '할부', '대부업', '이자제한', '대중교통', '도시가스', '1인가구', '택배'] },
  family: { name: '신혼·육아', words: ['저출산', '출산', '육아', '보육', '아동수당', '모자보건', '영유아', '난임', '신혼'] },
  pet: { name: '반려동물 가구', words: ['동물보호', '반려', '수의사', '동물'] },
  teen: { name: '중고등학생', words: ['학교폭력', '학교급식', '급식', '초·중등교육', '초ㆍ중등교육', '청소년', '학교보건', '학교안전', '교육과정', '학원의 설립', '학교 밖', '학생인권', '통학', '어린이·청소년', '아동·청소년', '교원지위', '학교용지'] },
  digital: { name: '게임·디지털', words: ['게임', '정보통신망', '개인정보', '인공지능', '저작권', '콘텐츠', '전자금융', '가상자산'] },
};
const laws = all.filter(r => isLaw(r.BILL_NAME));
if (laws[0]) console.log('의안 필드: ' + Object.keys(laws[0]).join(','));
const lifeBills = [];
for (const r of laws) {
  const n = String(r.BILL_NAME || ''), t = Object.entries(LIFE).filter(([, f]) => f.words.some(w => n.includes(w))).map(([k]) => k);
  if (!t.length) continue;
  const v = byId[r.BILL_ID];
  lifeBills.push({ id: r.BILL_ID, n, d: r.PROPOSE_DT || '', p: String(r.PROPOSER || r.RST_PROPOSER || '').slice(0, 40), k: r.PROPOSER_KIND || '', s: status(r), pd: r.PROC_DT || '', c: (r.CURR_COMMITTEE || '').replace(/위원회$/, ''), cpd: r.CMT_PRESENT_DT || '', t, ...(v ? { y: +v.YES_TCNT, no: +v.NO_TCNT } : {}) });
}
lifeBills.sort((a, b) => String(b.d).localeCompare(String(a.d)));
const base = {}; laws.forEach(r => { const k = status(r); base[k] = (base[k] || 0) + 1; });
writeFileSync(`${OUT}/life.json`, JSON.stringify({ updated: new Date().toISOString(), rules: LIFE, base, total: laws.length, bills: lifeBills }));
console.log(`생활 상황별 법률안 ${lifeBills.length}건 (전체 법률안 ${laws.length}건, 상태 ${JSON.stringify(base)})`);
