"use client";

import { useEffect, useRef, useState } from "react";

/** 차트 상자의 실제 너비(px). 글자 크기를 화면 폭과 상관없이 같게 두려고 viewBox 대신 실제 폭으로 그린다 */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 축 눈금용 보기 좋은 최댓값 (1·2·2.5·5·10 단위) */
export function niceMax(v: number): number {
  if (v <= 0) return 2;
  // 작은 건수는 가운데 눈금도 정수가 되게 짝수로
  if (v <= 10) return Math.max(2, Math.ceil(v / 2) * 2);
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** 차트 색. 사이트 색(민트·잉크)에 맞추고 색약 구분을 확인한 4색 (순서 고정) */
export const CHART = {
  bar: "#3DD6A3",
  barHot: "#077A59",
  line: "#077A59",
  grid: "#E5E9F0",
  axis: "#CBD2DE",
  text: "#6C778D",
  ink: "#0B1426",
  ref: "#98A1B4",
  cat: ["#0B9A70", "#3B82F6", "#C9771A", "#7C5CC4"],
} as const;
