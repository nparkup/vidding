# 기업 정보 중계 서버 (Cloudflare Worker)

평가점수 예측의 "사업자번호 조회"는 공공데이터포털 서비스키가 필요하다. GitHub Pages는 정적 사이트라 키를 숨길 곳이 없어서,
이 Worker가 키를 비밀값으로 들고 국세청·나라장터·금융위원회 API를 대신 호출한다. 조회 로직은 `src/lib/corpLookup.ts`.

## 처음 한 번 설정

1. Cloudflare 무료 가입 후 대시보드의 Workers & Pages 화면을 한 번 열어 workers.dev 하위 도메인을 만든다.
2. My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" 템플릿으로 토큰을 만든다.
3. GitHub 저장소 Settings > Secrets and variables > Actions 에 추가한다.
   - `CLOUDFLARE_API_TOKEN`: 2번 토큰
   - `CLOUDFLARE_ACCOUNT_ID`: 대시보드 오른쪽의 Account ID
   - `DATA_GO_KR_SERVICE_KEY`: 이미 있음
4. Actions > "기업 정보 중계 서버 배포" 를 실행한 뒤, "GitHub Pages 배포" 를 한 번 실행한다.
   Pages 빌드가 계정의 workers.dev 주소를 찾아 사이트에 넣는다. 주소를 직접 정하려면 저장소 변수 `CORP_API_URL` 을 쓴다.

허용 사이트는 `wrangler.toml` 의 `ALLOWED_ORIGINS`, 같은 번호는 12시간 캐시한다.
