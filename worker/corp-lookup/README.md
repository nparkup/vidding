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

## 낙찰 저장소 (R2)

유사 실적과 낙찰률 통계는 Cloudflare R2 버킷 `bidmate-awards` 에 모은 나라장터 낙찰 10년치(유사 실적은 최근 5년)를 먼저 쓴다. 조회 때 조달청 API를 부르지 않는다.

- 수집: `.github/workflows/awards.yml` → `scripts/awards/collect.ts`. 한 주씩 낙찰·공고·참가가능지역·업종제한을 받아 `raw/` 에 두고,
  공고번호로 합쳐 사업자번호 6~9번째 자리별 `shards/0000~9999.json.gz` 와 `stats/` 를 만든다. 처음 채우는 기간은 실행마다 100분씩 며칠에 나눠 채운다.
- Worker: `GET /?awards=사업자번호&biz=용역` (R2 바인딩 `AWARDS`). 저장소가 그 기간을 다 채우기 전에는 화면이 예전 방식(`?perf=`)으로 직접 조회한다.
- 사이트 빌드: `scripts/awards/forBuild.ts` 가 최근 1년 낙찰률 통계, 같은 수요기관의 과거 유사 공고, 지금 공고의 세부품명·중분류를 R2에서 읽는다.
- 용량: R2 사용량이 승인 용량(저장소 변수 `R2_APPROVED_BYTES`, 기본 5GB)의 90%에 닿거나 예상 최종 용량이 넘으면 수집이 올리지 않고 실패로 끝난다.
  사용자 승인 후 변수를 올려야 이어진다. 2026-11-15 첫 수집 기준 약 2년치가 0.12GB여서 5년치는 약 0.35GB로 예상한다.
- 토큰: `CLOUDFLARE_API_TOKEN` 에 Workers R2 Storage Write 권한이 있어야 한다. 수집 워크플로의 "R2 권한 확인" 단계가 읽기·쓰기를 시험한다.

## 관리자 화면 API와 운영 지표

관리자 화면(`/admin`, `src/components/admin/AdminConsole.tsx`)은 `?admin=동작` 으로 이 Worker를 부른다. 로그인(`?admin=login`)만 빼고 모두 12시간 서명 토큰이 필요하다. 동작 목록은 `admin.ts` 머리말.

- 회원: R2 `members/{사업자번호}.json` (가입 정보·상태·관리 메모), `trial/{사업자번호}.json` (무료 체험 사용 공고), `billing/{사업자번호}.json` (결제 기록, 결제 대행사 연동 전이라 관리자가 적는다)
- 이용 정지(`status: "suspended"`)한 사업자번호는 `?trial=` 이 새 공고를 더하지 않고 `suspended: true` 를 돌려준다
- 운영 지표: Durable Object `Metrics`(`metrics.ts`, SQLite). 요청마다 경로·상태·처리 시간, 그 사이 공공데이터포털·Anthropic 호출(전역 fetch를 감싸 센다)을 날짜별로 더한다.
  사이트는 화면을 옮길 때 `?pv=1&p=경로` 를 보낸다(`src/components/PageBeacon.tsx`). 순 방문은 그날만 쓰는 무작위 값과 IP·브라우저 정보를 섞은 해시로 세고 이틀 뒤 지운다. IP는 앞 세 자리만 남긴다.
