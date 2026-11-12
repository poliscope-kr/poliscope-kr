// 공공데이터포털 API 연결 점검: 키가 등록됐는지, 각 API의 요청 주소가 무엇인지 확인한다(키 값은 출력하지 않음).
const KEY = (process.env.DATA_GO_KR_KEY || '').trim();
console.log('DATA_GO_KR_KEY 등록:', KEY ? `예 (길이 ${KEY.length}, % 포함 ${KEY.includes('%')})` : '아니오');
for (const id of ['15158834', '15138721']) {
  try {
    const html = await (await fetch(`https://www.data.go.kr/data/${id}/openapi.do`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const urls = [...new Set(html.match(/https?:\/\/apis\.data\.go\.kr\/[A-Za-z0-9_\/.\-]+/g) || [])];
    const hosts = [...new Set(html.match(/"(host|basePath)"\s*:\s*"[^"]+"/g) || [])];
    const paths = [...new Set((html.match(/"\/[A-Za-z0-9_\/\-]+"\s*:\s*\{\s*"(get|post)"/g) || []))];
    console.log('==', id, '주소', urls.slice(0, 8), hosts.slice(0, 4), paths.slice(0, 8));
    const sw = html.match(/swaggerJson\s*=\s*(['"`])([\s\S]{0,400})/); if (sw) console.log('swagger 앞부분', sw[2].slice(0, 400));
  } catch (e) { console.log(id, '실패', e.message); }
}
if (KEY.length > 20) {
  for (const k of [KEY, encodeURIComponent(KEY)]) {
    const u = `https://apis.data.go.kr/B551178/airport-transport-stats/info?serviceKey=${k}&pageNo=1&numOfRows=5&startDePd=202509&endDePd=202509&routeBe=0&type=json&_type=json`;
    try { const r = await fetch(u); const t = await r.text(); console.log('시험 호출', k === KEY ? '그대로' : '인코딩', r.status, t.slice(0, 700)); } catch (e) { console.log('시험 실패', e.message); }
  }
}
