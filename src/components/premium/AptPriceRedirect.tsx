"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 예전 주소(/premium?apt=…#apt-price)로 들어오면 아파트 예측 화면으로 옮긴다 */
export function AptPriceRedirect() {
  const router = useRouter();
  useEffect(() => {
    const apt = new URLSearchParams(window.location.search).get("apt");
    if (!apt && window.location.hash !== "#apt-price") return;
    router.replace(apt ? `/premium/apt?apt=${encodeURIComponent(apt)}` : "/premium/apt");
  }, [router]);
  return null;
}
