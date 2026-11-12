/**
 * 공고 상세 링크.
 * 공고가 1만 건이 넘어 공고마다 정적 페이지를 만들면 GitHub Pages 용량(1GB)과 빌드 시간을 넘는다.
 * 그래서 상세는 /bids/view?id=... 한 페이지가 /bids-data.json 에서 공고를 찾아 브라우저에서 그린다 (서버 배포도 같은 주소).
 */
export function bidHref(id: string, qs?: string): string {
  const q = new URLSearchParams({ id });
  return `/bids/view?${q}${qs ? `&${qs}` : ""}`;
}
