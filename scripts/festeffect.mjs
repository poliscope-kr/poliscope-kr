// 축제 효과 추정: 한국관광공사 통신 빅데이터(지자체별 일별 방문자)와 축제 개최 기간을 맞춰
// "축제 기간에 평소보다 더 온 외지인·외국인 방문자"를 계산하고, 지자체 행사·축제 예산(지방재정365)과 나란히 놓는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const KEY = (process.env.DATA_GO_KR_KEY || '').trim(), C = 'MobileOS=ETC&MobileApp=poliscope&_type=json', Y = Number(process.env.FEST_YEAR || new Date().getFullYear()), LASTM = Y < new Date().getFullYear() ? 12 : new Date().getMonth(); // 올해는 지난달까지
if (KEY.length < 20) { console.log('DATA_GO_KR_KEY가 없어 건너뜁니다.'); process.exit(0); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(path, q) {
  for (let i = 0; i < 4; i++) {
    try { const j = await (await fetch(`https://apis.data.go.kr/B551011/${path}?serviceKey=${KEY}&${C}&${q}`, { signal: AbortSignal.timeout(60000) })).json(); const b = j.response?.body; if (j.response?.header?.resultCode !== '0000') { console.log(path, j.response?.header || JSON.stringify(j).slice(0, 200)); return null; } const it = b?.items?.item; return { total: b.totalCount, rows: Array.isArray(it) ? it : it ? [it] : [] }; }
    catch (e) { await wait(4000 * (i + 1)); }
  }
  return null;
}
mkdirSync('data', { recursive: true });
// 1) 일별 방문자(외지인+외국인) — 한 번 받은 달은 저장해 두고 다시 받지 않는다
const VF = `data/visitors-${Y}.json`, V = existsSync(VF) ? JSON.parse(readFileSync(VF, 'utf8')) : { days: {}, names: {}, months: {} };
let calls = 0;
for (let m = 1; m <= LASTM; m++) {
  const mm = String(m).padStart(2, '0'), last = new Date(Y, m, 0).getDate();
  if (V.months[mm]) continue;
  let ok = true;
  for (let p = 1; p < 60; p++) {
    const r = await get('DataLabService/locgoRegnVisitrDDList', `numOfRows=1000&pageNo=${p}&startYmd=${Y}${mm}01&endYmd=${Y}${mm}${last}`); calls++;
    if (!r) { ok = false; break; }
    for (const x of r.rows) { if (x.touDivCd === '1') continue; const k = x.signguCode; V.names[k] = x.signguNm; const d = (V.days[k] = V.days[k] || {}); d[x.baseYmd] = Math.round((d[x.baseYmd] || 0) + Number(x.touNum)); }
    if (p * 1000 >= r.total) break; await wait(150);
  }
  if (ok) V.months[mm] = 1; else break;
  console.log('방문자', Y, mm, '누적 호출', calls);
}
writeFileSync(VF, JSON.stringify(V));
if (Object.keys(V.months).length < LASTM) { console.log('방문자 자료가 아직 다 모이지 않았습니다(한도 초과 등). 다음 실행에 이어서 받습니다.'); }
// 2) 축제 목록
const fest = [];
for (let p = 1; p < 20; p++) { const r = await get('KorService2/searchFestival2', `numOfRows=1000&pageNo=${p}&eventStartDate=${Y - 1}0101&arrange=A`); if (!r) break; fest.push(...r.rows); if (p * 1000 >= r.total) break; }
console.log('축제', fest.length);
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`, P = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const out = {}, DAYUP = {};
for (const f of fest) {
  const code = (f.lDongRegnCd || '') + (f.lDongSignguCd || ''), D = V.days[code]; if (!D || code.length !== 5) continue;
  const s = P(f.eventstartdate), e = P(f.eventenddate), len = Math.round((e - s) / 864e5) + 1;
  if (s.getFullYear() !== Y || e.getFullYear() !== Y || len < 1 || len > 10 || ymd(e) > `${Y}${String(LASTM).padStart(2, '0')}31`) continue; // 열흘 넘는 상설 행사는 뺀다
  let up = 0, base = 0, act = 0, n = 0;
  for (let t = new Date(s); t <= e; t.setDate(t.getDate() + 1)) {
    const a = D[ymd(t)]; if (a == null) continue;
    const b = [-28, -21, -14, 14, 21, 28].map(o => D[ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + o))]).filter(v => v != null);
    if (b.length < 3) continue; const bb = b.sort((x, y) => x - y)[Math.floor(b.length / 2)]; // 같은 요일 중앙값
    up += a - bb; base += bb; act += a; n++;
    (DAYUP[code] = DAYUP[code] || {})[ymd(t)] = a - bb;
  }
  if (!n) continue;
  (out[code] = out[code] || { n: V.names[code], f: [] }).f.push({ t: f.title, s: f.eventstartdate, e: f.eventenddate, up: Math.round(up), pct: base ? Math.round((act / base - 1) * 100) : null });
}
// 3) 행사·축제 예산과 맞추기 (지방재정365 자치단체 코드 앞 5자리 = 시군구 코드)
const FE = JSON.parse(readFileSync('docs/data/festival.json', 'utf8')), res = [];
const SIDO = { 11: '서울', 26: '부산', 27: '대구', 28: '인천', 29: '광주', 30: '대전', 31: '울산', 36: '세종', 41: '경기', 42: '강원', 51: '강원', 43: '충북', 44: '충남', 45: '전북', 52: '전북', 46: '전남', 47: '경북', 48: '경남', 50: '제주' };
const byName = {}; for (const g of FE.govs) byName[g.s + '|' + g.n] = g;
// 시 아래 일반구(수원시 팔달구 등)는 시로, 제주시·서귀포시는 제주특별자치도로 묶는다(예산이 그 단위로 편성됨)
const merged = {};
for (const [code, o] of Object.entries(out)) {
  const sd = code.startsWith('12') ? (/^(동구|서구|남구|북구|광산구)$/.test(o.n) ? '광주' : '전남') : SIDO[code.slice(0, 2)], nm = sd === '제주' ? '제주 본청(광역)' : o.n.includes(' ') ? o.n.split(' ')[0] : o.n, k = sd + '|' + nm;
  const mg = (merged[k] = merged[k] || { code, sd, n: nm, f: [], days: {} }); mg.f.push(...o.f); Object.assign(mg.days, DAYUP[code] || {});
}
for (const [k, o] of Object.entries(merged)) {
  const code = o.code, g = byName[k]; if (!g || !g.v[Y]) { console.log('예산 연결 안 됨', k); continue; }
  const up = Math.round(Object.values(o.days).reduce((t, v) => t + v, 0)); // 축제가 겹친 날은 한 번만 센다
  res.push({ cd: code, n: g.n, s: g.s, bud: g.v[Y][0], nf: o.f.length, up, per: up > 0 ? Math.round(g.v[Y][0] * 1e8 / up) : null, top: o.f.sort((a, b) => b.up - a.up).slice(0, 5) });
}
writeFileSync('docs/data/festeffect.json', JSON.stringify({ updated: new Date().toISOString(), y: Y, until: `${Y}.${LASTM}`, nfest: fest.length, src: '한국관광공사 빅데이터 지역별 방문자수(KT·SKT 통신 자료) · 한국관광공사 관광정보(축제 기간) · 행정안전부 지방재정365', govs: res }));
console.log('결과 지자체', res.length, JSON.stringify(res.slice(0, 3)).slice(0, 800));
