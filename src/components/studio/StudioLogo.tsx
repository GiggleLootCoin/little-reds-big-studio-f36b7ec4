import { cn } from "@/lib/utils";
import studioLogo from "../../../1784996969001.png";

export function StudioLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("group/logo relative inline-flex items-center select-none", className)}
      aria-label="Little Red's Big Studio"
    >
      <img
        src={studioLogo}
        alt="Little Red's Big Studio"
        className={cn(
          "h-auto shrink-0 object-contain drop-shadow-[0_0_24px_oklch(0.62_0.24_26_/_0.48)] transition-transform duration-500 group-hover/logo:scale-[1.035]",
          compact ? "w-28 sm:w-32" : "w-48 sm:w-64",
        )}
      />
    </span>
  );
}
