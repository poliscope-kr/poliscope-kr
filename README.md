# POLISCOPE KR
열린국회정보 공개 자료로 제22대 국회의원 의정활동을 보여 주는 정적 사이트입니다.
- 수집: `.github/workflows/collect.yml` (매일 1회, 저장소 비밀값 `ASSEMBLY_API_KEY`)
- 화면: `docs/` (GitHub Pages: main 브랜치 /docs)
- 직접 실행: `ASSEMBLY_API_KEY=인증키 node scripts/collect.mjs`

## 향후 계획 (비용 필요)
- 유튜브·SNS 말의 내용 분류: 정책·입법, 지역 현안, 상대 비판·정쟁, 선거·당무, 본인 일정·출연. 제목 단어만으로는 정확도가 낮아 AI 분류(유료 API)와 표본 검수가 필요하다. 동기나 공익 여부는 판정하지 않는다.
