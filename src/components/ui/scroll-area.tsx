import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight scroll area that does not depend on a runtime UI package.
 * Keeping this primitive native makes the Studio more resilient on the
 * Cloudflare/Node build path while preserving the shadcn-style API used by
 * the rest of the application.
 */
const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative overflow-auto", className)} {...props}>
      {children}
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("hidden", className)} {...props} />
  ),
);
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
