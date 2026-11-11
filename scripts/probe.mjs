// 점검용: 의안 목록 후보 자료의 항목과 건수를 확인한다 (인증키는 출력하지 않음).
const KEY = process.env.ASSEMBLY_API_KEY, BASE = 'https://open.assembly.go.kr/portal/openapi';
const tries = [['TVBPMBILL11', { AGE: '22' }], ['TVBPMBILL11', {}], ['ALLBILL', { AGE: '22' }], ['nwbpacrgavhjryiph', { AGE: '22' }], ['ncocpgfiaoituanbr', { AGE: '22' }], ['nknalejkafmvgzmpt', {}], ['BILLRCP', { ERACO: '제22대' }], ['BILLINFOPPSR', { BILL_ID: 'PRC_X2Y4W1E2F1D6D1C7D0B0B4K9I4I9G3' }], ['ncdgqmzgapnehfezv', { AGE: '22' }], ['nxjuyqnxadtotdrbw', { AGE: '22' }], ['nojepdqqaweusdfbi', { AGE: '22', BILL_ID: 'PRC_X2Y4W1E2F1D6D1C7D0B0B4K9I4I9G3' }]];
for (const [id, p] of tries) {
  try {
    const r = await fetch(`${BASE}/${id}?` + new URLSearchParams({ KEY, Type: 'json', pIndex: 1, pSize: 3, ...p }));
    const j = await r.json();
    if (j.RESULT) { console.log(id, JSON.stringify(p), '→', j.RESULT.CODE, j.RESULT.MESSAGE); continue; }
    const b = j[id]; const total = b?.[0]?.head?.[0]?.list_total_count; const row = b?.[1]?.row?.[0] || {};
    console.log(id, JSON.stringify(p), '→ 총', total, '항목:', Object.keys(row).join(','), '\n  예시:', JSON.stringify(row).slice(0, 600));
  } catch (e) { console.log(id, '실패', e.message); }
}
