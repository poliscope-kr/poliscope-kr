import { execSync } from 'node:child_process';
for (const u of ['https://lofin365.go.kr', 'https://www.lofin365.go.kr', 'https://lofin365.go.kr/lf/hub/AJEFC?Type=json&pIndex=1&pSize=1']) {
  try { console.log('curl', u, execSync(`curl -sS -m 20 -o /dev/null -w "%{http_code} %{ssl_verify_result}" "${u}" 2>&1 || true`).toString()); } catch (e) { console.log('curl 실패', u, e.message.slice(0, 200)); }
  try { console.log('curl -k', u, execSync(`curl -sSk -m 20 "${u}" 2>&1 | head -c 300 || true`).toString().replace(/\s+/g, ' ')); } catch (e) { console.log('curl -k 실패', e.message.slice(0, 200)); }
  try { const r = await fetch(u); console.log('fetch', u, r.status); } catch (e) { console.log('fetch 실패', u, e.cause?.code || e.message); }
}
