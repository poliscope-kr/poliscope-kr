import http from 'node:http';
let n=0;http.createServer((q,s)=>{n++;const u=new URL(q.url,'http://x');const id=u.pathname.split('/').pop();const j=o=>{s.setHeader('content-type','application/json');s.end(JSON.stringify(o))};
if(id==='channels'){const h=u.searchParams.get('forHandle');if(h==='@없음')return j({items:[]});return j({items:[{id:'UC1',snippet:{title:'채널'},contentDetails:{relatedPlaylists:{uploads:'UU1'}}}]})}
if(id==='playlistItems'){const items=Array.from({length:50},(_,i)=>{const d=new Date(Date.now()-i*20*864e5).toISOString();return{snippet:{title:'영상 '+i,publishedAt:d},contentDetails:{videoId:'v'+i,videoPublishedAt:d}}});return j({items})}
if(id==='videos')return j({items:u.searchParams.get('id').split(',').map((v,i)=>({id:v,contentDetails:{duration:i%2?'PT45S':'PT12M3S'}}))});j({items:[]})}).listen(8941);
