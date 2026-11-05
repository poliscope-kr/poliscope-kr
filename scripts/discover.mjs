// 열린국회정보 API 목록에서 필요한 자료의 서비스 ID와 항목을 찾아 data/api-catalog.json에 남긴다(인증키 불필요).
import { writeFileSync, mkdirSync } from 'node:fs';
const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Referer: 'https://open.assembly.go.kr/portal/openapi/main.do' };
const cat = await (await fetch('https://open.assembly.go.kr/portal/openapi/selectInfsOpenApiListPaging.do?page=1&rows=400&schVOrder=D', { headers: H })).json();
console.log('API 수', cat.data?.length);
const want = /국외|출장|업무추진비|비용추계|정치자금|재산|예비금|특수활동|상임위 활동|수당|세비|국민동의청원/;
const out = [];
for (const it of cat.data || []) {
  if (!want.test(it.infaNm || '')) continue;
  const seq = String(it.openSrv || '').split(',').find(s => s.startsWith('A-'))?.slice(2);
  if (!seq) { console.log('API 없음:', it.infaNm); continue; }
  const r = await fetch('https://open.assembly.go.kr/portal/data/openapi/selectOpenApiMeta.do', { method: 'POST', headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ infId: it.infaId, infSeq: seq }) });
  const m = (await r.json()).data || {};
  const rec = { name: it.infaNm, service: m.apiRes, request: (m.variables || []).map(v => `${v.colId}:${v.colNm}${v.reqNeed === 'Y' ? '*' : ''}`), output: (m.cols || m.columns || m.outputs || []).map(c => `${c.colId}:${c.colNm}`), keys: Object.keys(m) };
  out.push(rec); console.log(JSON.stringify(rec));
}
mkdirSync('data', { recursive: true }); writeFileSync('data/api-catalog.json', JSON.stringify(out, null, 1));
