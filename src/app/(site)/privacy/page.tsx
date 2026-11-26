import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import { BACKUP_DAILY_KEEP, BACKUP_MONTHLY_KEEP, BILLING_RETAIN_YEARS, OPERATOR, PRIVACY_VERSION } from "@/lib/privacy";

export const metadata: Metadata = { title: "개인정보처리방침" };

/**
 * 개인정보처리방침. 실제로 저장·처리하는 방식(worker/corp-lookup account.ts·admin.ts·metrics.ts·backup.ts)과 맞춰 적는다.
 * 저장 방식이 바뀌면 이 문서와 src/lib/privacy.ts PRIVACY_VERSION 을 같이 고친다.
 */
const TBD = <span className="text-ink-400">(기재 예정)</span>;
const v = (s: string) => (s ? s : TBD);

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-24 border-t border-ink-100 py-8 first:border-t-0">
      <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">제{n}조 {title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-paper text-ink-500"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-ink-100 align-top">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  const date = PRIVACY_VERSION.replace(/-/g, ". ") + ".";
  return (
    <>
      <PageHero title="개인정보처리방침" lead={<>비드매트릭스(이하 &lsquo;서비스&rsquo;)가 어떤 개인정보를 왜 받고, 얼마나 두며, 어떻게 지키는지 적었습니다. 시행일 {date}</>} />
      <div className="container-x max-w-4xl py-6 sm:py-10">
        <Sec n={1} title="처리하는 개인정보 항목">
          <Table
            head={["구분", "항목", "받는 때"]}
            rows={[
              ["회원가입 (필수)", "회사명, 사업자등록번호, 담당자 이름, 연락처, 이메일, 비밀번호(복원할 수 없는 해시 값으로만 저장)", "회원가입·관리자 등록"],
              ["회원가입 (선택)", "맞춤 공고 조건(업종·면허, 지역, 사업 규모, 키워드), 이메일 수신 동의 여부", "회원가입·내 정보 수정"],
              ["서비스 이용", "내 서류함에 담은 공고, 분석한 공고 번호와 사용 건수, 이용권 결제 기록(이용권, 결제일, 금액, 결제 수단, 메모), 동의한 처리방침 판과 동의 시각", "이용 중"],
              ["비회원 이용", "입찰점수 예측에 입력한 사업자등록번호와 그 번호로 분석한 공고 번호(무료 체험 건수 확인용)", "예측 화면 이용 시"],
              ["자동 수집", "요청 경로·시각·처리 결과, IP 주소 앞 세 자리(나머지는 지움), 접속 국가, 방문한 화면 경로, 유입 사이트 주소(사이트 이름만), 휴대폰·PC 구분, 날마다 바뀌는 무작위 값으로 만든 방문자 구분값(원래 IP로 되돌릴 수 없음)", "사이트 이용 시"],
            ]}
          />
          <p>주민등록번호 등 고유식별정보, 카드번호·계좌번호는 받지 않습니다. 결제 대행사(PG)를 연동하면 카드 정보는 결제 대행사가 직접 처리하고 서비스는 저장하지 않습니다.</p>
        </Sec>

        <Sec n={2} title="처리 목적">
          <ul className="list-disc space-y-1 pl-5">
            <li>회원 확인, 로그인, 계정 보호(비밀번호 반복 실패 잠금)</li>
            <li>무료 체험·이용권 사용 건수 확인과 이용권 관리, 요금 안내</li>
            <li>맞춤 공고 선별과, 수신에 동의한 경우 맞춤 공고·서비스 소식 메일 발송</li>
            <li>고객 문의 응대, 부정 이용 방지, 서비스 오류 확인과 개선을 위한 통계</li>
          </ul>
        </Sec>

        <Sec n={3} title="보유 기간과 파기">
          <Table
            head={["정보", "보유 기간"]}
            rows={[
              ["회원 정보(가입 정보·로그인 계정·내 서류함)", "회원 탈퇴 때까지. 탈퇴하면 바로 지웁니다. 남은 이용권이 있으면 이용권이 끝난 다음 날 지우도록 고를 수 있습니다."],
              ["이용권 결제 기록", `탈퇴 후 ${BILLING_RETAIN_YEARS}년 (전자상거래 등에서의 소비자보호에 관한 법률: 대금결제·재화 공급 기록). 회원 정보와 떼어 따로 보관하고 기간이 지나면 지웁니다.`],
              ["탈퇴 기록(회사명·사업자등록번호·탈퇴 방식·날짜)", `${BILLING_RETAIN_YEARS}년 (결제 기록 확인과 무료 체험 중복 사용 방지). 담당자·연락처·이메일은 남기지 않습니다.`],
              ["무료 체험 사용 기록(사업자등록번호·공고 번호)", "마지막 사용 후 1년"],
              ["접속 기록(요청 기록)", "30일"],
              ["관리자 작업·로그인 기록", "400일"],
              ["방문자 구분값", "2일 (날짜별 집계 숫자만 남김)"],
              ["백업본", `매일 백업 ${BACKUP_DAILY_KEEP}개, 매달 백업 ${BACKUP_MONTHLY_KEEP}개만 남겨, 지운 정보도 백업본에서는 최대 약 90일 뒤 모두 사라집니다.`],
            ]}
          />
          <p>파기는 전자 파일을 복구할 수 없게 지우는 방식으로 합니다. 종이로 출력한 개인정보는 없습니다.</p>
        </Sec>

        <Sec n={4} title="제3자 제공">
          <p>개인정보를 다른 회사나 기관에 제공하지 않습니다. 법령에 따라 수사기관 등이 정해진 절차로 요구하는 경우는 예외입니다.</p>
          <p>입찰점수 예측과 기업 정보 조회를 위해 입력한 사업자등록번호로 공공데이터포털(조달청·국세청·특허청 등 공공 API)에 그 기업의 공개 정보를 조회합니다. 이때 보내는 값은 사업자등록번호뿐입니다.</p>
        </Sec>

        <Sec n={5} title="처리 위탁과 국외 이전">
          <p>서비스 운영을 위해 아래 회사의 클라우드를 씁니다. 두 회사 모두 해외 사업자라 개인정보가 국외로 이전됩니다.</p>
          <Table
            head={["받는 자", "위탁 업무", "이전 국가·방법·시기", "이전 항목", "보유 기간"]}
            rows={[
              ["Cloudflare, Inc. (privacy@cloudflare.com)", "서버 운영(중계 서버), 회원·결제 자료와 백업 저장", "미국 등 Cloudflare 데이터센터 · 네트워크 전송 · 가입·이용할 때마다", "제1조의 회원가입·서비스 이용·비회원 이용·자동 수집 항목", "제3조의 기간 또는 위탁 계약이 끝날 때까지"],
              ["GitHub, Inc.", "웹사이트 화면 게시(회원 정보는 저장하지 않음)", "미국 · 네트워크 전송 · 사이트를 열 때", "접속 IP 주소 등 접속 정보", "GitHub 정책에 따름"],
            ]}
          />
          <p>국외 이전을 원하지 않으시면 회원가입을 하지 않으실 수 있습니다. 다만 이 경우 로그인이 필요한 기능은 이용할 수 없습니다.</p>
          <p>입찰 공고 첨부 문서의 배점표를 읽을 때 Anthropic(미국)의 분석 도구를 쓰지만, 보내는 것은 공개된 공고 문서뿐이며 회원 개인정보는 보내지 않습니다.</p>
        </Sec>

        <Sec n={6} title="이용자의 권리와 행사 방법">
          <ul className="list-disc space-y-1 pl-5">
            <li>열람·정정: 로그인 후 <Link href="/account" className="font-semibold text-mint-600 underline">내 정보</Link>에서 바로 보고 고칠 수 있습니다.</li>
            <li>삭제(탈퇴): 내 정보에서 직접 탈퇴할 수 있습니다. 법정 보존 기록(제3조)은 기간이 끝날 때까지 따로 둡니다.</li>
            <li>동의 철회·처리 정지: 메일 수신 동의는 내 정보에서 언제든 끌 수 있습니다. 그 밖의 요청은 {OPERATOR.email}로 보내 주시면 10일 안에 처리 결과를 알려 드립니다.</li>
            <li>대리인을 통해서도 요청할 수 있으며, 이 경우 위임 사실을 확인할 수 있는 자료를 함께 보내 주셔야 합니다.</li>
          </ul>
        </Sec>

        <Sec n={7} title="자동 수집 장치(쿠키 등)">
          <p>쿠키를 쓰지 않습니다. 대신 브라우저 저장소(localStorage)에 로그인 상태, 무료 체험 사용 공고, 화면 설정을 이 기기에만 저장합니다. 브라우저 설정에서 사이트 데이터를 지우면 함께 지워집니다.</p>
        </Sec>

        <Sec n={8} title="안전성 확보 조치">
          <ul className="list-disc space-y-1 pl-5">
            <li>비밀번호는 복원할 수 없는 해시 값(PBKDF2-SHA256, 사용자별 salt)으로만 저장합니다.</li>
            <li>모든 전송은 HTTPS로 암호화합니다. 회원·관리자 자료는 브라우저나 중간 서버에 캐시하지 않습니다.</li>
            <li>회원 자료는 공개 주소가 없는 저장소에 두고 중계 서버를 통해서만 읽고 씁니다. 관리자 화면은 아이디·비밀번호와 2단계 인증, 로그인 실패 잠금, 30분 미사용 자동 로그아웃을 씁니다.</li>
            <li>관리자 작업과 로그인 기록을 남기고, 요청이 지나치게 많으면 자동으로 제한합니다.</li>
            <li>회원·결제 자료는 매일 별도 저장소에 백업합니다.</li>
          </ul>
        </Sec>

        <Sec n={9} title="개인정보 보호책임자">
          <Table
            head={["구분", "내용"]}
            rows={[
              ["상호", v(OPERATOR.company)],
              ["대표자", v(OPERATOR.ceo)],
              ["개인정보 보호책임자", v(OPERATOR.officer)],
              ["문의", <a key="m" href={`mailto:${OPERATOR.email}`} className="font-semibold text-mint-600 underline">{OPERATOR.email}</a>],
            ]}
          />
        </Sec>

        <Sec n={10} title="권익 침해 구제 방법">
          <p>개인정보 침해에 대한 신고나 상담이 필요하시면 아래 기관에 문의하실 수 있습니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 국번 없이 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청: 국번 없이 1301 (www.spo.go.kr)</li>
            <li>경찰청: 국번 없이 182 (ecrm.police.go.kr)</li>
          </ul>
        </Sec>

        <Sec n={11} title="처리방침의 변경">
          <p>이 처리방침은 {date}부터 시행합니다. 내용이 바뀌면 시행 7일 전(이용자에게 불리하게 바뀌면 30일 전)에 사이트 공지로 알립니다.</p>
        </Sec>
      </div>
    </>
  );
}
