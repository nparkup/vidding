import { PageHead } from "@/components/AdminUI";
import { ClientForm } from "@/components/ClientForm";
import { getClient, getInquiry } from "@/lib/store";

export const metadata = { title: "고객사 등록" };

export default async function NewClient({ searchParams }: { searchParams: Promise<{ id?: string; from?: string }> }) {
  const sp = await searchParams;
  const existing = sp.id ? await getClient(sp.id) : undefined;
  const inq = sp.from ? await getInquiry(sp.from) : undefined;
  const init = existing ?? (inq ? { ...inq, id: undefined, status: "체험" as const, fromInquiry: inq.id } : {});
  return (
    <>
      <PageHead title={existing ? `${existing.company} 조건 수정` : "고객사 등록"} desc={inq ? `상담 신청(${inq.company})에서 불러왔습니다.` : "선별 조건을 입력하면 다음 영업일부터 메일이 발송됩니다."} />
      <ClientForm init={init} />
    </>
  );
}
