"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 모바일에서 가로로 넘기는 탭·칩 줄.
 * 스크롤바는 숨기고, 더 넘길 내용이 있는 쪽 끝만 흐리게 해서 이어진다는 걸 보여 준다.
 * 선택된 항목(aria-current·aria-selected)이 잘려 있으면 처음에 보이는 곳으로 옮긴다.
 */
export function ScrollRow({
  as: Tag = "div",
  className = "",
  children,
  active,
  ...rest
}: {
  as?: "div" | "nav" | "ul";
  className?: string;
  children: ReactNode;
  /** 선택 항목이 바뀌는 값. 바뀔 때마다 선택 항목을 보이는 곳으로 옮긴다 */
  active?: string | number;
  role?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = el.querySelector<HTMLElement>("[aria-current=page],[aria-selected=true]");
    if (sel && el.scrollWidth > el.clientWidth + 1) {
      const left = sel.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft || left + sel.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = left - (el.clientWidth - sel.offsetWidth) / 2;
      }
    }
  }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = String(max > 1 && el.scrollLeft > 1);
      el.dataset.fadeEnd = String(max > 1 && el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  const Comp = Tag as "div";
  return (
    <Comp ref={ref as React.Ref<HTMLDivElement>} className={`scroll-row ${className}`} {...rest}>
      {children}
    </Comp>
  );
}
