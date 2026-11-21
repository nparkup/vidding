"use client";

import {
  Boxes, BrushCleaning, Building2, Cable, CodeXml, DraftingCompass, Ellipsis, FileSearch, FireExtinguisher, HardHat,
  Layers, LayoutGrid, Megaphone, Monitor, Package, Recycle, Shield, SprayCan, Stethoscope, Trees, Truck, Utensils,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_GROUPS, type ServiceCategory } from "@/lib/types";

/** 업종별 선 아이콘 (단색, 업종을 빨리 알아보게 하는 기능용) */
const ICONS: Record<ServiceCategory, LucideIcon> = {
  청소: BrushCleaning,
  시설관리: Building2,
  경비: Shield,
  "방역·소독": SprayCan,
  통합관리: Layers,
  "IT·소프트웨어": CodeXml,
  "설계·감리·엔지니어링": DraftingCompass,
  "연구·조사·컨설팅": FileSearch,
  "폐기물·환경": Recycle,
  "행사·홍보·교육": Megaphone,
  "운송·여행·임차": Truck,
  "기타 용역": Ellipsis,
  "건축·토목공사": HardHat,
  "전기·통신공사": Cable,
  "소방·기계설비공사": FireExtinguisher,
  "조경·산림": Trees,
  "의료·의약품": Stethoscope,
  "식자재·급식": Utensils,
  "컴퓨터·전산장비": Monitor,
  관급자재: Boxes,
  "기타 물품": Package,
};

/** 타일에 넣기 긴 업종명은 줄여 쓴다 (필터 값은 원래 이름 그대로) */
const SHORT: Partial<Record<ServiceCategory, string>> = {
  "설계·감리·엔지니어링": "설계·감리",
  "연구·조사·컨설팅": "연구·컨설팅",
  "소방·기계설비공사": "소방·설비공사",
};

/** 넓은 화면: 용역(맨 앞 전체 포함)은 한 줄 전체, 공사·물품은 한 줄에 나란히 (타일 폭이 같도록 13칸 기준) */
const LAYOUT: Record<string, { span: string; cols: string }> = {
  용역: { span: "lg:col-span-full", cols: "lg:grid-cols-[repeat(13,minmax(0,1fr))]" },
  공사: { span: "lg:col-span-4", cols: "lg:grid-cols-4" },
  물품: { span: "lg:col-span-5", cols: "lg:grid-cols-5" },
};

/** 공고 검색 상단의 업종 아이콘 선택 */
export function CategoryTiles({ value, counts, onPick }: { value: string; counts: Record<string, number>; onPick: (cat: string) => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <section className="card mt-6 p-4 sm:p-5" aria-label="업종 선택">
      <p className="text-sm font-bold">업종으로 찾기</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[repeat(13,minmax(0,1fr))] lg:gap-x-2">
        {Object.entries(CATEGORY_GROUPS).map(([g, cs], i) => (
          <div key={g} className={LAYOUT[g]?.span}>
            <p className="mb-1.5 text-xs font-semibold text-ink-400">{g}</p>
            <div className={`grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2 ${LAYOUT[g]?.cols ?? "lg:grid-cols-12"}`}>
              {i === 0 && <Tile icon={LayoutGrid} label="전체" title="전체 업종" count={total} on={!value} onClick={() => onPick("")} />}
              {cs.map((c) => (
                <Tile key={c} icon={ICONS[c]} label={SHORT[c] ?? c} title={c} count={counts[c] ?? 0} on={value === c} onClick={() => onPick(value === c ? "" : c)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Tile({ icon: Icon, label, title, count, on, onClick }: { icon: LucideIcon; label: string; title?: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title ?? label}
      className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center transition ${
        on ? "border-mint bg-mint-50 text-mint-700" : count ? "border-ink-100 bg-white text-ink-700 hover:border-ink-300" : "border-ink-100 bg-white text-ink-300"
      }`}
    >
      <Icon className={`h-6 w-6 ${on ? "text-mint-600" : count ? "text-ink-500" : "text-ink-200"}`} strokeWidth={1.6} aria-hidden />
      <span className="w-full break-keep text-[12px] font-semibold leading-tight sm:text-[13px]">{label}</span>
      <span className="text-[11px] tabular-nums text-ink-400">{count.toLocaleString()}</span>
    </button>
  );
}
