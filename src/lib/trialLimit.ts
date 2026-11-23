/** 무료 체험으로 분석할 수 있는 입찰공고 수. 서버 컴포넌트에서도 쓰도록 따로 둔다 (worker/corp-lookup TRIAL_LIMIT 와 같게) */
export const TRIAL_LIMIT = 3;

/**
 * 무료 체험 건수 제한을 켤지. 테스트 기간이라 잠시 꺼 둔다 (2026-11-23).
 * false면 로그인하지 않았거나 무료 체험 회원은 건수를 세지 않고 모든 공고를 분석한다 (사용 건수 안내·체험 종료 화면도 숨김).
 * 유료 이용권 회원은 이 값과 상관없이 이용권 한 달 건수로 센다. 다시 켜려면 true로 바꾸면 된다.
 */
export const TRIAL_LIMIT_ENABLED = false;
