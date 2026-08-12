import { cn } from "@/lib/utils";

export function StudioLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("group/logo relative inline-flex items-center gap-3 select-none", className)}
      aria-label="Little Red's Big Studio"
    >
      <svg
        viewBox="0 0 76 76"
        role="img"
        aria-hidden="true"
        className={cn(
          "shrink-0 drop-shadow-[0_0_18px_oklch(0.62_0.24_26_/_0.55)] transition-transform duration-500 group-hover/logo:scale-105",
          compact ? "size-10" : "size-14 sm:size-16",
        )}
      >
        <defs>
          <linearGradient id="redDrop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a5f" />
            <stop offset="0.55" stopColor="#d71932" />
            <stop offset="1" stopColor="#6f0718" />
          </linearGradient>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="38" cy="38" r="32" fill="#0b0506" stroke="#8f1328" strokeWidth="2" />
        <path
          d="M18 27c8-9 30-13 41-3l-4 7c-7-5-23-5-34 2l-3-6Z"
          fill="url(#redDrop)"
          filter="url(#softGlow)"
        />
        <path d="M25 34h27l-3 22c-1 7-5 11-10 11s-9-4-10-11l-4-22Z" fill="url(#redDrop)" />
        <path
          d="M27 35c2 8 3 13 1 22M49 35c-2 7-2 13 1 21"
          fill="none"
          stroke="#ff7b7f"
          strokeOpacity=".45"
          strokeWidth="1.5"
        />
        <circle cx="31" cy="42" r="2.5" fill="#fff" />
        <circle cx="45" cy="42" r="2.5" fill="#fff" />
        <path
          d="M32 51c4 3 8 3 12 0"
          fill="none"
          stroke="#fff"
          strokeOpacity=".8"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M22 18c5-6 10-8 16-8M54 18c-4-5-8-7-13-8"
          fill="none"
          stroke="#ff5a5f"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span className="min-w-0 text-left leading-none">
          <span className="block font-display text-[0.9rem] font-black uppercase tracking-[0.12em] text-white sm:text-base">
            Little Red's
          </span>
          <span className="mt-1 block font-display text-[0.62rem] font-bold uppercase tracking-[0.28em] text-primary sm:text-[0.68rem]">
            Big Studio
          </span>
        </span>
      )}
    </span>
  );
}
