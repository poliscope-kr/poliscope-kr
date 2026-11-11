// 게시물·영상 제목 분류 규칙(인스타그램·유튜브 공용). 글에 단어가 있으면 그 분류로 센다. 모든 의원과 대통령에게 같은 규칙.
export function makeCats(FIELDS) {
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const LIFEW = [...new Set(Object.values(FIELDS).flatMap(f => f.words || []))];
  return {
    work: { name: '입법·의정활동', re: /법안|법률|발의|개정안|입법|본회의|상임위|국정감사|국감|예산|질의|대정부질문|청문회|토론회|간담회|의정/ },
    life: { name: '민생·정책', re: new RegExp([...LIFEW, '민생', '물가', '일자리', '주거', '전세', '복지', '소상공인', '자영업', '청년', '어르신', '아동', '돌봄', '피해 지원', '대책', '지원금', '생활'].map(esc).join('|')) },
    local: { name: '지역 활동', re: /지역구|지역 주민|주민|현장 방문|현장|민원|동네|우리 지역/ },
    fight: { name: '정치 공방·비판', re: /규탄|비판|심판|탄핵|특검|독재|내란|정권|사퇴|거짓|망언|막말|방탄|공세|무능|폭주|국정조사|정치 보복/ },
    party: { name: '선거·당무', re: /선거|(?<!선수 )후보(?!선수|생)|공천|경선|당대표|최고위원|전당대회|(?<!담)당원|유세|총선|대선(?![수배박])|지방선거/ },
  };
}
export const catsOfText = (CATS, t) => Object.entries(CATS).filter(([, v]) => v.re.test(t)).map(([k]) => k);
