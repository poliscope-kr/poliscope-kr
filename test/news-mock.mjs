import http from 'node:http';
http.createServer((q,s)=>{const u=new URL(q.url,'http://x');if(!q.headers['x-ncp-apigw-api-key-id']){s.statusCode=401;return s.end('x')}
const name=u.searchParams.get('query').split(' ')[0],st=+u.searchParams.get('start');const d=i=>new Date(Date.now()-i*36e5*6).toUTCString();const T=[`${name} 의원, 주거 법안 대표발의`,`${name} 의원 지역구 예산 확보`,`${name} 의원 강하게 비판`,`${name} 의원 수사 논란`,`${name} 시의원 축제 참석`,`다른 사람 기사`,`${name} 의원 인터뷰`];
const items=st>1?[]:T.map((t,i)=>({title:t.replace(name,`<b>${name}</b>`),originallink:'https://example.com/'+i,link:'',description:'설명',pubDate:d(i)}));s.setHeader('content-type','application/json');s.end(JSON.stringify({items}))}).listen(8942);
