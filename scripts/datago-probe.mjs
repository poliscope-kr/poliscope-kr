const KEY = (process.env.DATA_GO_KR_KEY || '').trim(), C = 'MobileOS=ETC&MobileApp=poliscope&_type=json';
for (const u of [
  `https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList?serviceKey=${KEY}&${C}&numOfRows=6&pageNo=1&startYmd=20251001&endYmd=20251001`,
  `https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${KEY}&${C}&numOfRows=3&pageNo=1&eventStartDate=20250101&arrange=A`,
]) { try { const r = await fetch(u); const t = await r.text(); console.log('시험', u.split('?')[0].split('/').pop(), r.status, t.slice(0, 1500)); } catch (e) { console.log('실패', e.message); } }
