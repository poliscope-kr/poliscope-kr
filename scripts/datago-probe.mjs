const KEY = (process.env.DATA_GO_KR_KEY || '').trim();
for (const id of ['15101972', '15101578']) {
  try {
    const html = await (await fetch(`https://www.data.go.kr/data/${id}/openapi.do`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const t = (html.match(/<title>([^<]*)/) || [])[1];
    const host = [...new Set(html.match(/"host"\s*:\s*"[^"]+"/g) || [])], paths = [...new Set(html.match(/"\/[A-Za-z0-9_]+"\s*:\s*\{\s*"get"/g) || [])];
    console.log('==', id, t, host, paths.slice(0, 20));
    const m = html.match(/"\/metcoRegnVisitrDDList"[\s\S]{0,1500}/) || html.match(/"\/searchFestival2?"[\s\S]{0,1500}/); if (m) console.log('파라미터', (m[0].match(/"name"\s*:\s*"[^"]+"/g) || []).join(' '));
  } catch (e) { console.log(id, e.message); }
}
