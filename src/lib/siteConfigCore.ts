/**
 * 사이트 설정의 모양과 기본값, 다듬기 규칙. 화면(src/lib/siteConfig.ts)과 중계 서버(worker/corp-lookup)가 같이 쓴다. React를 쓰지 않는다.
 */
import { PLANS } from "./plans";
import { TRIAL_LIMIT } from "./trialLimit";

export interface SiteConfig {
  banner: { on: boolean; text: string; link: string; linkLabel: string; tone: "info" | "warn"; from: string; to: string };
  /** 월간 이용권 금액(VAT 포함)과 한 달 공고 예측 건수 (무제한 이용권은 건수 없음) */
  pricing: { lite: number; standard: number; unlimited: number; liteQuota: number; standardQuota: number };
  trialLimit: number;
  features: { mybox: boolean };
  updatedAt?: string;
}

/** 관리자가 아직 아무것도 정하지 않았을 때의 값 (코드에 적힌 요금·체험 건수) */
export const DEFAULT_CONFIG: SiteConfig = {
  banner: { on: false, text: "", link: "", linkLabel: "", tone: "info", from: "", to: "" },
  pricing: {
    lite: PLANS[0].price, standard: PLANS[1].price, unlimited: PLANS[2].price,
    liteQuota: PLANS[0].quota ?? 100, standardQuota: PLANS[1].quota ?? 200,
  },
  trialLimit: TRIAL_LIMIT,
  features: { mybox: false },
};


/** 들어온 값을 안전한 범위로 다듬는다 */
export function normalizeConfig(raw: unknown): SiteConfig {
  const r = (raw ?? {}) as Partial<SiteConfig>;
  const d = DEFAULT_CONFIG;
  const num = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const b = (r.banner ?? {}) as Partial<SiteConfig["banner"]>;
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const link = str(b.link, 300);
  return {
    banner: {
      on: b.on === true, text: str(b.text, 200), link: /^(https:\/\/|\/)/.test(link) ? link : "", linkLabel: str(b.linkLabel, 30),
      tone: b.tone === "warn" ? "warn" : "info", from: date(b.from), to: date(b.to),
    },
    // 예전 모양(monthly·annualMonthly)으로 저장된 값은 버리고 기본값을 쓴다
    pricing: {
      lite: num(r.pricing?.lite, d.pricing.lite, 1000, 10_000_000),
      standard: num(r.pricing?.standard, d.pricing.standard, 1000, 10_000_000),
      unlimited: num(r.pricing?.unlimited, d.pricing.unlimited, 1000, 10_000_000),
      liteQuota: num(r.pricing?.liteQuota, d.pricing.liteQuota, 1, 100_000),
      standardQuota: num(r.pricing?.standardQuota, d.pricing.standardQuota, 1, 100_000),
    },
    trialLimit: num(r.trialLimit, d.trialLimit, 0, 50),
    features: { mybox: r.features?.mybox === true },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}
