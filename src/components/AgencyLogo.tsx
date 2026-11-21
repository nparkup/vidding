import { agencyLogoLabel, agencyLogoSrc } from "@/lib/agencyLogos";

/**
 * 발주기관명 앞에 붙는 작은 공식 CI. 확인된 CI가 없는 기관은 아무것도 그리지 않는다(추측한 로고를 쓰지 않음).
 * size: 표시 높이(px). 가로로 긴 CI는 maxW 까지 늘어난다.
 */
export function AgencyLogo({ name, size = 18, maxW = 96, className = "" }: { name: string; size?: number; maxW?: number; className?: string }) {
  const src = agencyLogoSrc(name);
  if (!src) return null;
  const label = agencyLogoLabel(name);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${label} CI`}
      title={label === "대한민국 정부상징" ? "중앙행정기관 공통 정부상징" : `${label} CI`}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 object-contain align-middle ${className}`}
      style={{ height: size, width: "auto", maxWidth: maxW }}
    />
  );
}
