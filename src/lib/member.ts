"use client";

/**
 * 이 브라우저에서 가입·로그인한 사업자번호. 가입·로그인하면 적어 두고(src/lib/account.ts),
 * 입찰점수 예측이 그 번호로 무료 체험 건수를 중계 서버와 맞춘다 (src/lib/trial.ts).
 * 키는 bidmate. 접두어가 아니어서 새로고침 초기화(resetOnReload)에 지워지지 않는다.
 */
export const MEMBER_KEY = "bm-member.v1";

export interface MemberLocal { bizno: string; company: string; at: number }

export function readMember(): MemberLocal | null {
  try {
    const j = JSON.parse(localStorage.getItem(MEMBER_KEY) ?? "null") as MemberLocal | null;
    return j && /^\d{10}$/.test(j.bizno) ? j : null;
  } catch {
    return null;
  }
}

export function saveMember(m: MemberLocal) {
  try { localStorage.setItem(MEMBER_KEY, JSON.stringify(m)); } catch { /* 저장 못 해도 가입은 끝난다 */ }
}
