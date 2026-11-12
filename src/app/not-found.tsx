import SiteLayout from "./(site)/layout";
import NotFound from "./(site)/not-found";

/** 사이트 전체의 404 (정적 배포에서는 404.html). 예전 공고 주소는 여기서 /bids/view 로 옮긴다 */
export default function RootNotFound() {
  return (
    <SiteLayout>
      <NotFound />
    </SiteLayout>
  );
}
