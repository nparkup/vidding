# 입찰메이트랩

용역·공사·물품 **전 업종 중소기업을 위한 맞춤형 공공입찰 발굴·공고 분석 대행 서비스** 웹사이트입니다.
나라장터의 모든 공고를 매일 받아 21개 업종으로 나누고, 고객사의 면허·영업지역·수행 가능 규모로 선별해 참가조건·제출서류·입찰 가능성을 정리해 전달합니다.

## 실행

```bash
npm install
cp .env.example .env.local   # 값 입력
npm run dev                  # http://localhost:3000
```

- 관리자: `/admin` (비밀번호 = `ADMIN_PASSWORD`, 미설정 시 개발용 `admin1234`)
- `DATA_GO_KR_SERVICE_KEY`가 없으면 목업 공고 40건(청소·시설관리 + 다른 업종 용역·공사·물품)으로 동작합니다.

## 화면 구성

| 공개 사이트 | 설명 |
|---|---|
| `/` | 메인: 포지셔닝, 30초 매칭 체험, 서비스 5종, 분석 미리보기, 요금, FAQ |
| `/service` | 수집→분류→선별→분석→전달 5단계, 일일 메일 샘플 |
| `/bids` | 전 업종 공고 검색(업무 구분·업종·지역·마감) + 내 조건(면허·지역·규모) 적용 시 가능성 점수 |
| `/bids/[id]` | 공고 분석: 핵심 요약, 일정, 제출서류 체크리스트, 가능성 점수, 투찰 가이드 |
| `/premium` | 프리미엄 평가점수 예측: 공고 첨부파일(PDF·HWPX·DOCX)에서 평가항목·배점·통과 기준 추출 → 기업 정보·신용평가등급확인서와 결합 → 항목별 예상 점수, 통과 여부, 통과 가능한 투찰률 |
| `/report/sample` | 주간 분석보고서 샘플 |
| `/pricing` | 베이직·프로·파트너 요금제 비교 |
| `/apply` | 무료 진단 신청 → 즉시 참가 가능 공고 미리보기 |

| 관리자 | 설명 |
|---|---|
| `/admin` | KPI, 오늘의 메일 발송 대기열, 업종별 공고, 마감 임박, 최근 상담 |
| `/admin/clients` | 고객사 조건 관리, 고객별 추천 공고·관심 공고·메일 미리보기 |
| `/admin/bids` | 수집 공고 전체와 매칭 고객사, 수동 수집 |
| `/admin/reports` | 주간 보고서 초안 생성·코멘트·발송 |
| `/admin/inquiries` | 상담 신청 상태 관리, 고객사 전환 |
| `/admin/settings` | 공공데이터포털 API 연동 상태, 발송 시각 |

## 공공데이터포털 API

`src/lib/nara/endpoints.ts`에 정리되어 있으며, 같은 인증키로 각 서비스를 활용신청해야 합니다.

0. **조달청_나라장터 공공데이터개방표준서비스** (현재 수집 원천) — `/1230000/ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo`
   응답 하나에 투찰가능업종·참가가능지역·마감일이 모두 포함. 조회 기간은 하루 단위만 허용되어 날짜별로 호출.
   용역·공사·물품·외자 전부 수집하며 하루 약 2,000건, 최근 3일치 진행 중 공고는 5,000건 안팎
1. **조달청_나라장터 입찰공고정보서비스** — `/1230000/ad/BidPublicInfoService02` (오퍼레이션 이름도 02로 끝남)
   용역 공고 목록, 참가가능지역, 면허제한, 기초금액, **공고 첨부파일 URL(ntceSpecDocUrl1~10)** — 평가점수 예측의 원문 자동 확보에 필요. 2026-11-12 승인 확인
2. **조달청_나라장터 낙찰정보서비스** (권장) — 과거 낙찰률·참여업체 수 → 가능성 점수
3. **조달청_나라장터 사전규격정보서비스** (권장) — 사전규격 선제 알림
4. **조달청_나라장터 계약정보서비스** (선택) — 발주기관 계약 이력
5. **조달청_나라장터 사용자정보서비스** (승인됨) — `/ao/UsrInfoService02` 사업자등록번호로 조달업체 기본정보·등록 업종 조회 (평가점수 예측, 서버 배포의 `/api/premium/corp`)

## 구조

- `src/lib/nara/` 나라장터 API 클라이언트 (키 있으면 실데이터, 실패 시 목업 폴백)
- `src/lib/nara/client.ts` 의 `classify()` 업종 분류: 용역은 청소·시설관리 판별 → 투찰가능업종 → 공고명 키워드 순, 공사·물품은 투찰가능업종 → 공고명
- `src/lib/licenses.ts` 면허명 정규화·매칭 (가운뎃점 표기 통일, `엔지니어링사업` 같은 상위 업종은 괄호 세부분야까지 매칭)
- `src/lib/analysis.ts` 1차 선별(면허·지역·금액), 가능성 점수, 체크리스트, 투찰 가이드
- `/bids-data.json` 공고 전체 목록. 공고 검색·매칭 체험·진단 신청은 페이지에 공고를 싣지 않고 이 파일을 받아 브라우저에서 계산
- `src/lib/evalscore.ts` 평가점수 예측: 표준 평가표(적격심사·협상계약), 원문 평가표 추출, 항목별 채점, 통과 투찰률 역산
- `src/lib/docText.ts` 브라우저에서 첨부파일 텍스트 추출 (PDF는 pdf.js, HWPX·DOCX는 압축 XML). 파일은 서버로 보내지 않음
- `src/lib/nara/corp.ts` 조달업체 조회, 공고 첨부파일 목록(입찰공고정보서비스 승인 후 동작)
- `src/lib/digest.ts` 일일 맞춤 메일 구성
- `src/lib/db.ts` 저장소 어댑터: `DATABASE_URL`이 있으면 PostgreSQL(테이블 자동 생성), 없으면 `data/runtime-db.json`
- `src/lib/store.ts` 고객사·상담·보고서·발송기록·설정 저장, 공고는 메모리 캐시
- `src/lib/mail/` 메일 템플릿(일일 요약, 주간 보고서)과 SMTP 발송. SMTP 미설정 시 기록만 남김
- `src/lib/jobs.ts` 일일 발송(영업일·중복 방지), 주간 보고서 초안 생성
- `src/lib/holidays.ts` 공휴일 목록 (매년 갱신)

## 자동 발송

| 엔드포인트 | 권장 주기 | 동작 |
|---|---|---|
| `GET /api/cron/daily` | 매시 (06~08시 KST) | 설정한 발송 시각 이후 첫 호출에서 영업일이면 전 고객사에 맞춤 공고 메일 발송. 같은 날 중복 발송 안 함 |
| `GET /api/cron/weekly` | 매주 월요일 07:30 KST | 프로·파트너 고객사 주간 보고서 초안 생성 (매니저가 코멘트 후 발송) |

두 엔드포인트 모두 `Authorization: Bearer $CRON_SECRET` 헤더가 필요합니다. Vercel에서는 `vercel.json`의 crons가 이 헤더를 자동으로 붙입니다 (기본값은 매일 07:00 KST 1회, Hobby 요금제 제한에 맞춤. 함수는 서울 리전 icn1에서 실행). 다른 서버에서는 crontab으로 curl 호출하면 됩니다.

## 배포 체크리스트

- `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `CRON_SECRET` 설정
- `DATABASE_URL` 설정 (Vercel 등 서버리스는 파일 저장이 유지되지 않으므로 필수), `SEED_DEMO=false`
- `SMTP_*`, `MAIL_FROM`, `SITE_URL` 설정
- `DATA_GO_KR_SERVICE_KEY` 설정 후 관리자 > 설정·API 에서 연동 상태 확인

## 다음 단계

- 낙찰정보 연동으로 경쟁강도·사정률 실데이터 반영
- 사전규격 알림

## GitHub Pages (정적 공개 사이트)

`https://nparkup.github.io/vidding/` 로 공개되는 버전입니다. 서버가 없으므로 아래처럼 동작합니다.

| 기능 | Pages 버전 |
|---|---|
| 메인·서비스·요금제·보고서 샘플 | 그대로 |
| 공고 검색·공고 분석·가능성 점수 | 그대로 (점수 계산은 브라우저에서) |
| 나라장터 공고 | `.github/workflows/pages.yml` 이 영업일 06:40·11:40·16:40(KST)에 수집 후 재배포 |
| 무료 진단 신청 | 브라우저에서 추천 공고 표시 + 메일 앱으로 신청 내용 전송 (`APPLY_EMAIL` 변수) |
| 관리자·고객 DB·메일 자동 발송 | 제외 (서버 배포 시 사용) |

설정 (저장소 Settings):
1. Pages → Source: **GitHub Actions**
2. Secrets and variables → Actions → Secrets: `DATA_GO_KR_SERVICE_KEY`
3. Secrets and variables → Actions → Variables: `APPLY_EMAIL` (신청 받을 이메일)

로컬에서 확인: `npx tsx --conditions=react-server scripts/fetch-bids.ts data/bids.json && BIDS_FILE=data/bids.json PAGES_BASE_PATH=/vidding node scripts/build-static.mjs` → `out/`
