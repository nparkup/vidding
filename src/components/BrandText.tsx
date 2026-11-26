import { Fragment, type ReactNode } from "react";

/** 비드매트릭스·비드파인더·비드아틀라스·비드인사이트 */
const BRAND_RE = /비드(매트릭스|파인더|아틀라스|인사이트)/g;

/** 브랜드 이름 하나: 로고처럼 "비드" + 민트색 나머지. dark는 어두운 배경용 */
export function Brand({ tail, dark = false }: { tail: string; dark?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      비드<span className={dark ? "text-mint-400" : "text-mint-600"}>{tail}</span>
    </span>
  );
}

/** 문장 안의 브랜드 이름을 찾아 "비드" 뒤를 민트색으로 칠한다. 문자열이 아니면 그대로 둔다 */
export function BrandText({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  if (typeof children !== "string") return <>{children}</>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of children.matchAll(BRAND_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(children.slice(last, i));
    out.push(<Brand key={i} tail={m[1]} dark={dark} />);
    last = i + m[0].length;
  }
  if (last === 0) return <>{children}</>;
  if (last < children.length) out.push(children.slice(last));
  return <>{out.map((x, k) => <Fragment key={k}>{x}</Fragment>)}</>;
}
