# 의정 나침반 (POLISCOPE KR)
열린국회정보 공개 자료로 제22대 국회의원 의정활동을 보여 주는 정적 사이트입니다.
- 수집: `.github/workflows/collect.yml` (매일 1회, 저장소 비밀값 `ASSEMBLY_API_KEY`)
- 화면: `docs/` (GitHub Pages: main 브랜치 /docs)
- 직접 실행: `ASSEMBLY_API_KEY=인증키 node scripts/collect.mjs`

## 향후 서비스 예정
사이트의 공지사항(`#notice`, `docs/index.html`의 `PLANNED`)에서 관리한다. 예산 확보 후 순차 제공한다.
