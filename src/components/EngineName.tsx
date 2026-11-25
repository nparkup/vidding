import { ENGINES, type EngineId } from "@/lib/engines";

/** 엔진 이름: 로고처럼 "비드" + 민트색 나머지. dark는 어두운 배경용 */
export function EngineName({ id, dark = false, className = "" }: { id: EngineId; dark?: boolean; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      비드<span className={dark ? "text-mint-400" : "text-mint-600"}>{ENGINES[id].tail}</span>
    </span>
  );
}
