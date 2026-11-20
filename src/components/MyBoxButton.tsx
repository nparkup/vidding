"use client";

import { useEffect, useState } from "react";
import { addToMyBox, inMyBox, MYBOX_EVENT, removeFromMyBox } from "@/lib/mybox";
import type { Bid } from "@/lib/types";

/** 공고를 관심공고 서류함에 담기 / 빼기 */
export function MyBoxButton({ bid, className = "btn-ghost btn-sm" }: { bid: Bid; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(inMyBox(bid.bidNtceNo));
    sync();
    window.addEventListener(MYBOX_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(MYBOX_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [bid.bidNtceNo]);
  return (
    <button type="button" aria-pressed={on} className={`${className} ${on ? "border-mint bg-mint-50 text-mint-700" : ""}`}
      onClick={() => (on ? removeFromMyBox(bid.bidNtceNo) : addToMyBox(bid))}>
      {on ? "서류함에 담김" : "서류함에 담기"}
    </button>
  );
}
