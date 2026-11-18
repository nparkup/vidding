/**
 * 신뢰도 가감점(신인도) 항목 중 공공데이터 API로 1차 확인할 수 있는 것을 사업자번호 조회 결과에서 채운다.
 * 고객은 증빙 서류 기준으로 체크를 고칠 수 있고, 화면은 자동값과 달라지면 '수정됨'으로 보여 준다.
 *
 * API로 확인하는 항목 (src/lib/corpLookup.ts)
 * - 장애인기업 확인서: 한국중소벤처기업유통원 공공구매종합정보망 인증서 정보 제공 서비스 (장애인기업확인)
 * - 여성기업 (존속기간 구간): 같은 서비스의 여성기업확인 + 나라장터 개업일로 존속기간을 계산
 *
 * 공개 API가 없는 항목(혁신형 중소기업, 소기업·소상공인 확인서, 고용·저출생·정책지원 인증, 체불·하도급 감점)은
 * 증빙 서류로 고객이 체크한다. 사회적기업은 한국사회적기업진흥원 API가 있으나 사업자번호 조회 여부를 확인하지 못해 아직 연결하지 않았다.
 */
import type { CorpLookup } from "./corpLookup";

export interface TrustAuto {
  /** API 결과로 이 항목이 해당하는지 */
  on: boolean;
  /** 화면에 보이는 근거 */
  from: string;
}

/** API로 확인하는 항목의 묶음: 이 묶음 안의 체크는 조회 결과로 다시 채운다 */
export const API_TRUST_GROUPS: { ids: string[]; source: string }[] = [
  { ids: ["disabledBiz"], source: "공공구매종합정보망 장애인기업확인" },
  { ids: ["women10", "women5", "women3"], source: "공공구매종합정보망 여성기업확인 + 나라장터 개업일" },
];

const yearsBetween = (from: string, to: Date) => (to.getTime() - Date.parse(`${from.slice(0, 10)}T00:00:00+09:00`)) / (365.2425 * 86400e3);

/** 사업자번호 조회 결과로 확인한 신뢰도 가감점 항목. 조회하지 못한 항목은 넣지 않는다 */
export function trustFromCorp(c: CorpLookup, now = new Date()): Record<string, TrustAuto> {
  const out: Record<string, TrustAuto> = {};
  const d = c.certs?.disabled;
  if (d !== undefined) {
    out.disabledBiz = d?.valid
      ? { on: true, from: `장애인기업확인서 유효${d.validTo ? ` ~${d.validTo}` : ""}` }
      : { on: false, from: d ? `장애인기업확인서 유효기간 지남${d.validTo ? ` (${d.validTo})` : ""}` : "유효한 장애인기업확인서 없음" };
  }
  const w = c.certs?.women;
  if (w !== undefined) {
    const opened = c.nara?.openedAt ?? c.fsc?.establishedAt ?? c.openedAt;
    if (!w?.valid) {
      const from = w ? `여성기업확인서 유효기간 지남${w.validTo ? ` (${w.validTo})` : ""}` : "유효한 여성기업확인서 없음";
      for (const id of ["women10", "women5", "women3"]) out[id] = { on: false, from };
    } else if (opened) {
      const y = yearsBetween(opened, now);
      const band = y < 3 ? "women3" : y < 5 ? "women5" : y < 10 ? "women10" : undefined;
      const base = `여성기업확인서 유효${w.validTo ? ` ~${w.validTo}` : ""}, 개업 ${opened.slice(0, 10)} (존속 ${Math.floor(y)}년)`;
      for (const id of ["women10", "women5", "women3"]) out[id] = { on: id === band, from: band ? base : `${base}: 존속 10년 이상은 가점 구간 밖` };
    }
  }
  return out;
}

/** 조회 결과를 체크 목록에 반영한다: API로 확인한 묶음만 바꾸고 나머지(고객이 고른 항목)는 그대로 둔다 */
export function applyTrustAuto(selected: string[], auto: Record<string, TrustAuto>): string[] {
  const covered = API_TRUST_GROUPS.flatMap((g) => g.ids).filter((id) => auto[id]);
  return [...selected.filter((id) => !covered.includes(id)), ...covered.filter((id) => auto[id].on)];
}
