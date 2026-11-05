// 공직윤리시스템(국회공직자윤리위원회 공고) 재산공개 자료로 의원별 재임 중 재산 변화를 계산한다.
// 원자료: data/assets-raw.json (단위 천원). 새 공고가 나오면 원자료를 다시 받아 실행한다.
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.env.OUT_DIR || 'docs/data';
const raw = JSON.parse(readFileSync('data/assets-raw.json', 'utf8')), members = JSON.parse(readFileSync(`${OUT}/members.json`, 'utf8'));
const PIN = JSON.parse(readFileSync('data/assets-pin.json', 'utf8')); // 동명이인 연결
const CAT = [[/토지/, '토지'], [/건물/, '건물'], [/정치자금/, '정치자금 계좌'], [/예금/, '예금'], [/증권/, '증권'], [/가상자산/, '가상자산'], [/채권/, '빌려준 돈(채권)'], [/채무/, '채무'], [/현금/, '현금'], [/부동산에 관한|자동차/, '자동차·기타 권리'], [/./, '기타']];
const catOf = s => CAT.find(([re]) => re.test(s))[1];
const WHY = [['신고 대상 변화', /고지거부|고지 거부|등록\s*제외|합산|직계|혼인|이혼|사망|독립생계|제외|배우자.*반영|재신고|누락/], ['상속·증여', /상속|증여/], ['후원금·정치자금', /후원금|정치자금|의정활동|선거/], ['가격 변동', /가액|공시|평가|시세|기준시가|주가|감가/], ['부동산·자산 매매', /매입|매수|매매|취득|매도|매각|처분|분양|신축|계약|소유권|환수|변제|지분|신규|임차|전세/], ['급여·저축·생활비', /급여|세비|저축|생활비|소득|수입|지출|이자|배당|근로/], ['빚 상환·대출', /상환|차입|대출|채무/]];
const whyOf = s => s ? (WHY.find(([, re]) => re.test(s)) || ['기타'])[0] : '사유 미기재';
const byPid = {}; for (const r of raw) (byPid[r.pid] = byPid[r.pid] || []).push(r);
const out = {}, missing = [];
for (const m of members) {
  const pids = Object.keys(byPid).filter(p => byPid[p].some(r => r.name === m.name));
  const cur = PIN[m.id] || pids.map(p => [p, byPid[p].filter(r => !/^\(전\)/.test(r.job)).map(r => r.dt).sort().pop() || '']).sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0];
  if (!cur) { missing.push(m.name); continue; }
  const rs = byPid[cur].filter(r => r.tot).sort((a, b) => a.base.localeCompare(b.base) || a.dt.localeCompare(b.dt));
  // 기준: 제22대 임기 시작(2024-05-30) 무렵 신고. 없으면 임기 시작 전 마지막 정기 신고(재선 이상), 그것도 없으면 처음 신고(재·보궐).
  const startR = rs.find(r => r.base >= '2024-05-25' && r.base <= '2024-08-31') || rs.filter(r => r.base <= '2024-05-30').pop() || rs[0], last = rs[rs.length - 1]; if (!startR) { missing.push(m.name); continue; }
  const later = rs.filter(r => r.base > startR.base);
  const cats = {}; for (const [c, , , , p] of startR.subs) if (c !== '88') { const k = catOf(c); (cats[k] = cats[k] || [0, 0])[0] += p; } for (const [c, , , , p] of last.subs) if (c !== '88') { const k = catOf(c); (cats[k] = cats[k] || [0, 0])[1] += p; }
  const why = {}, top = [];
  for (const r of later) for (const [c, owner, kind, region, , inc, dec, , , reason] of r.items) {
    const cat = catOf(c), sign = cat === '채무' ? -1 : 1, amt = (inc - dec) * sign, w = cat === '정치자금 계좌' ? '후원금·정치자금' : whyOf(reason);
    why[w] = (why[w] || 0) + amt;
    if (w !== '가격 변동' && w !== '급여·저축·생활비' && w !== '후원금·정치자금') top.push({ y: r.base.slice(0, 4), cat, kind: kind || '', who: owner === '본인' ? '본인' : '가족', region: region || '', why: reason || '', amt });
  }
  out[m.id] = { start: { d: startR.base, t: startR.tot[4], no: startR.no }, end: { d: last.base, t: last.tot[4], no: last.no }, delta: last.tot[4] - startR.tot[4], series: rs.filter(r => r.base >= startR.base).map(r => [r.base, r.tot[4]]),
    cats: Object.entries(cats).map(([k, [a, b]]) => [k, a, b]).filter(([, a, b]) => a || b).sort((x, y) => Math.abs(y[2] - y[1]) - Math.abs(x[2] - x[1])),
    why: Object.entries(why).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
    top: top.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)).slice(0, 6), same: later.length === 0 };
}
writeFileSync(`${OUT}/assets.json`, JSON.stringify({ updated: new Date().toISOString(), unit: '천원', members: out, missing }));
console.log(`재산 자료: ${Object.keys(out).length}명, 없음: ${missing.join(', ')}`);
