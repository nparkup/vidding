/**
 * 발주기관 공식 CI 파일 목록 (public/agency-logos/ 안의 파일명).
 * 기관에서 사용 승인을 받았거나 이용 조건상 게시가 허용된 파일만 등록한다.
 * 등록되지 않은 기관은 자체 제작 유형 표시(AgencyMark)로 나온다.
 *
 * 예: "경기도 수원시": "suwon.svg"
 */
export const AGENCY_LOGOS: Record<string, string> = {};

export function agencyLogoSrc(name: string): string | undefined {
  const file = AGENCY_LOGOS[name.trim()];
  return file ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/agency-logos/${file}` : undefined;
}
