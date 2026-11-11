"use client";

import { useEffect, useState } from "react";
import type { Bid } from "./types";

let cache: Promise<Bid[]> | null = null;

export function loadBids(): Promise<Bid[]> {
  cache ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/bids-data.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Bid[]>;
    })
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** 공고 목록을 한 번만 받아 여러 컴포넌트가 함께 쓴다. 받기 전에는 null */
export function useBids(): { bids: Bid[] | null; error: boolean } {
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadBids().then((b) => alive && setBids(b)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);
  return { bids, error };
}
