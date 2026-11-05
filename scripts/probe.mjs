const KEY=process.env.ASSEMBLY_API_KEY,B='https://open.assembly.go.kr/portal/openapi/nasnutdbapnfphwyr';
for(const q of [{},{UNIT_CD:'100022'},{UNIT_CD:'22'},{UNIT_NM:'제22대'},{UNIT_CD:'100021'}]){const r=await fetch(B+'?'+new URLSearchParams({KEY,Type:'json',pIndex:1,pSize:3,...q}));const t=await r.text();console.log('PROBE',JSON.stringify(q),r.status,t.slice(0,700))}
