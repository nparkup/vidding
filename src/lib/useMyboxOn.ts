"use client";

import { useAccount } from "./account";
import { MYBOX_ENABLED } from "./mybox";
import { useSiteConfig } from "./siteConfig";

/** 내 서류함을 보일지: 로그인한 회원에게는 늘 보이고(서버에 저장되어 다른 기기에서도 이어 쓴다), 로그인하지 않았으면 관리자 화면 페이지 설정을 따른다 */
export function useMyboxOn(): boolean {
  const cfg = useSiteConfig();
  const acc = useAccount();
  return MYBOX_ENABLED || cfg.features.mybox || acc.status === "in";
}
