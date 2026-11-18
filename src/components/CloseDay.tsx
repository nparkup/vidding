import { isoDate } from "@/lib/format";

/** 공고명 앞에 붙이는 마감일 "[YYYY-MM-DD] " (마감일이 없으면 아무것도 표시하지 않음) */
export function CloseDay({ iso }: { iso?: string | null }) {
  const d = isoDate(iso);
  return d ? <span className="tabular-nums font-semibold text-ink-500">[{d}] </span> : null;
}
