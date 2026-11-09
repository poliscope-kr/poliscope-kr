// 시험 전용 가짜 국회 API. 실제 인물이 아닌 가상의 이름만 사용.
import http from 'node:http';
const parties=['가나당','다라당','마바당'];
const members=Array.from({length:260},(_,i)=>({HG_NM:i===5||i===6?'동명인':'가상의원'+i,HJ_NM:'',POLY_NM:parties[i%3],ORIG_NM:i%10===9?'비례대표':['서울 가상구갑','경기 시범시을','부산 예시구병'][i%3]+i,ELECT_GBN_NM:i%10===9?'비례대표':'지역구',CMITS:i%2?'교육위원회':'법제사법위원회, 예산결산특별위원회',REELE_GBN_NM:'초선',MONA_CD:'M'+i,JOB_RES_NM:i===0?'의장':'위원',TEL_NO:'02-000-'+i,HOMEPAGE:i%2?'https://example.com':'javascript:alert(1)',E_MAIL:'x@example.com',STAFF:'비공개여야함'}));
const bills=Array.from({length:430},(_,i)=>({BILL_ID:i<10?'V'+i:'B'+i,BILL_NAME:i%37==1?'독립유공자예우에 관한 법률 일부개정법률안':i%41==2?'일제강점하 반민족행위 진상규명에 관한 특별법 일부개정법률안':'가상법 일부개정법률안 '+i,PROC_RESULT:i%5==0?'원안가결':i%7==0?'대안반영폐기':null,COMMITTEE:i%2?'교육위원회':'법제사법위원회',PROPOSE_DT:'2025-0'+(i%9+1)+'-01',RST_PROPOSER:i%50==49?'동명인':i%40==39?'사직한사람':'가상의원'+(i%40),DETAIL_LINK:'https://example.com/b'+i,PROC_DT:i%5==0?'2026-01-01':null,PUBL_PROPOSER:'가상의원1,가상의원2,가상의원3'}));
const voteBills=Array.from({length:45},(_,i)=>({BILL_ID:'V'+i,BILL_NAME:i%11==3?'대일항쟁기 강제동원 피해조사 및 국외강제동원 희생자 등 지원에 관한 특별법 일부개정법률안(대안)':'가상 표결 법안 '+i,PROC_DT:'2026-0'+(i%9+1)+'-10',LINK_URL:'https://example.com/v'+i}));
let calls=0,voteCalls=0;
http.createServer((q,s)=>{const u=new URL(q.url,'http://x');const id=u.pathname.split('/').pop();calls++;
 const reply=o=>{s.setHeader('content-type','application/json');s.end(JSON.stringify(o))};
 if(u.searchParams.get('KEY')!=='testkey')return reply({RESULT:{CODE:'ERROR-290',MESSAGE:'인증키가 유효하지 않습니다.'}});
 let rows;
 if(id==='nwvrqwxyaytdsfvhu')rows=members;else if(id==='nzmimeepazxkubdpn')rows=bills;else if(id==='ncocpgfiaoituanbr')rows=voteBills;
 else if(id==='nojepdqqaweusdfbi'){voteCalls++;const n=+u.searchParams.get('BILL_ID').slice(1);rows=members.map((m,i)=>({MONA_CD:m.MONA_CD,RESULT_VOTE_MOD:i===0?'불참':i%17==0?'불참':i%13==0?'기권':((i+n)%3==0?'반대':'찬성')}))}
 else if(id==='nasnutdbapnfphwyr')rows=[{PN:'가상의원1',PURP_RSON:'회의',SCH_DYS:'2025-03-01 ~ 2025-03-05',DSTN_NM:'미국',EXPNS_SUPPT_INST_NM:'기관',REPORT_YN:'Y'},{PN:'가상의원1',SCH_DYS:'2025년 4월 1일',DSTN_NM:'일본'},{PN:'모름',SCH_DYS:'x'}];else if(id==='npsofwddayuhqhfgh')rows=[{REG_DATE:'2026-01-01',SUBJECT:'보고서',LINK_URL:'https://example.com'}];else if(id==='nalacaiwauxiynsxt')rows=[{PRDC_YM_NM:'2026-01',OPB_FL_NM:'파일',OPB_FL_PH:'https://example.com/f'}];else if(id==='BILLINFODETAIL')rows=[{BILL_NO:'1',PPSR:'위원장',JRCMIT_NM:'교육위원회',PPSL_DT:'2026-01-01',RGS_RSLN_DT:'2026-02-01',RGS_CONF_RSLT:'원안가결',PROM_DT:'2026-03-01'}];else if(id==='BPMBILLSUMMARY')rows=[{SUMMARY:'가상의 제안이유입니다.'}];else return reply({RESULT:{CODE:'ERROR-310',MESSAGE:'없음'}});
 const p=+u.searchParams.get('pIndex'),z=Math.min(+u.searchParams.get('pSize'),100),slice=rows.slice((p-1)*z,p*z);
 if(!slice.length)return reply({RESULT:{CODE:'INFO-200',MESSAGE:'해당하는 데이터가 없습니다.'}});
 reply({[id]:[{head:[{list_total_count:rows.length},{RESULT:{CODE:'INFO-000',MESSAGE:'정상'}}]},{row:slice}]});
}).listen(8931,()=>console.log('mock'));
