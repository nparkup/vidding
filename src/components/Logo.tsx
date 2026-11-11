import Link from "next/link";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="입찰파트너 홈">
      <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-[10px] bg-gradient-to-br from-mint-400 via-mint to-mint-700 text-white shadow-[0_6px_16px_-6px_rgba(18,184,134,.7)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4 4L19 7" />
        </svg>
        <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-white/30" />
      </span>
      <span className={`text-[17px] font-extrabold tracking-[-0.03em] ${light ? "text-white" : "text-ink"}`}>
        입찰파트너
      </span>
    </Link>
  );
}
