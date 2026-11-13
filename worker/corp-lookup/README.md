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

## 유사 실적 조회

평가점수 예측에서 사업자번호를 조회하면, 브라우저가 이 Worker에 최근 1년 낙찰 이력을 15주씩 나눠 묻는다 (`?perf=용역&bizno=&from=&to=`).
Worker는 그 기간을 7일 단위로 다시 쪼개 조달청 낙찰정보서비스를 부른다(이 API는 사업자번호 조건을 받지만 7일까지만 조회된다). 로직은 `src/lib/perfLookup.ts`.

- 공공데이터포털은 초당 요청 수를 제한한다(2026-11-13 실측: 초당 20회 통과, 40회는 429 후 20초가량 차단). 호출 간격 150ms, 브라우저 동시 묶음 2개로 맞췄다.
- 하루 호출 한도도 있다. 처음 조회하는 업체는 업무구분 하나에 약 53회를 쓴다(1년). 3년이면 약 157회라 2026-11-13에 1년으로 줄였다. 개발계정 한도를 넘으면 "일일 서비스 요청제한 횟수 초과"로 실패하므로, 실제 운영 전에 낙찰정보서비스 운영계정(트래픽 증가)을 신청한다.
- 끝난 지 일주일 넘은 기간은 결과가 바뀌지 않아 30일 캐시한다. 한 주라도 실패한 묶음은 캐시하지 않는다.
- 낙찰 건의 세부품명·중분류는 `?ntce=공고번호,…&biz=용역` 으로 입찰공고정보서비스에서 가져온다.
