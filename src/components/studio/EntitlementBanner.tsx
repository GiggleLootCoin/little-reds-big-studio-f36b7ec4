import { useEffect, useState } from "react";
import { Crown, Sparkles } from "lucide-react";
import { useEntitlement } from "@/hooks/use-entitlement";
import { getStoredSession } from "@/lib/supabase-rest";

const BMAC = "https://buymeacoffee.com/littleredbigsmile";
function remaining(end?: string | null) {
  if (!end) return "";
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return "Trial ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `${d}d ${h}h remaining`;
}
export function EntitlementBanner() {
  const { entitlement, ready, trialActive, unlimited, buddyUnleashed } = useEntitlement();
  const [left, setLeft] = useState(() => remaining(entitlement?.trial_ends_at));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(remaining(entitlement?.trial_ends_at)), 60000);
    setLeft(remaining(entitlement?.trial_ends_at));
    return () => window.clearInterval(id);
  }, [entitlement?.trial_ends_at]);
  if (!ready || !getStoredSession()) return null;
  if (unlimited)
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs">
        <div className="flex items-center gap-2">
          <Crown className="size-4 text-primary" />
          <strong>{buddyUnleashed ? "Paid — Buddy Unlimited" : "Paid — Studio Unlimited"}</strong>
          <span className="ml-auto text-muted-foreground">Server verified</span>
        </div>
        <p className="mt-1 text-muted-foreground">
          $10/month through your Little Red's Big Studio Buy Me a Coffee membership.
        </p>
      </div>
    );
  if (trialActive)
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <strong>FREE — 7 days unlimited</strong>
          <span className="ml-auto text-primary">{left}</span>
        </div>
        <p className="mt-1 text-muted-foreground">
          Your 7-day countdown starts on your first successful sign-up/login. No usage cap during
          the trial. After 7 days, continue for $10/month through Buy Me a Coffee.
        </p>
      </div>
    );
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Crown className="size-4 text-primary" />
        <strong>FREE TRIAL ENDED</strong>
        <a
          className="ml-auto font-semibold text-primary underline"
          href={BMAC}
          target="_blank"
          rel="noreferrer"
        >
          Unlock — $10/month
        </a>
      </div>
      <p className="mt-1 text-muted-foreground">
        Your projects remain yours. Subscribe through Buy Me a Coffee to restore unlimited Buddy and
        Studio access.
      </p>
    </div>
  );
}
