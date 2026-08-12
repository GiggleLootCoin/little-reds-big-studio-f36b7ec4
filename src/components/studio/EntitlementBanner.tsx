import { useEffect, useState } from "react";
import { Crown, Sparkles } from "lucide-react";
import { useEntitlement } from "@/hooks/use-entitlement";
import { getStoredSession } from "@/lib/supabase-rest";

const BMAC = "https://buymeacoffee.com/littleredbigsmile";
function remaining(end?: string) { if (!end) return ""; const ms = new Date(end).getTime() - Date.now(); if (ms <= 0) return "Trial ended"; const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); return `${d}d ${h}h remaining`; }
export function EntitlementBanner() {
  const { entitlement, ready, trialActive, unlimited, buddyUnleashed } = useEntitlement();
  const [left, setLeft] = useState(() => remaining(entitlement?.trial_ends_at));
  useEffect(() => { const id = window.setInterval(() => setLeft(remaining(entitlement?.trial_ends_at)), 60000); setLeft(remaining(entitlement?.trial_ends_at)); return () => window.clearInterval(id); }, [entitlement?.trial_ends_at]);
  if (!ready || !getStoredSession()) return null;
  if (unlimited) return <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs"><div className="flex items-center gap-2"><Crown className="size-4 text-primary" /><strong>{buddyUnleashed ? "Buddy Unleashed is unlocked" : "Buddy Unlimited is unlocked"}</strong><span className="ml-auto text-muted-foreground">Server verified</span></div></div>;
  if (trialActive) return <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 text-xs"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><strong>Seven-day all-access trial</strong><span className="ml-auto text-primary">{left}</span></div><p className="mt-1 text-muted-foreground">Your countdown comes from your account entitlement, not a browser timer.</p></div>;
  return <div className="rounded-2xl border border-border bg-background/50 p-3 text-xs"><div className="flex items-center gap-2"><Crown className="size-4 text-primary" /><strong>Free Studio access</strong><a className="ml-auto font-semibold text-primary underline" href={BMAC} target="_blank" rel="noreferrer">Buddy Unlimited — $10/month</a></div><p className="mt-1 text-muted-foreground">Your existing projects remain accessible. Eligible free exports can carry the Studio watermark.</p></div>;
}
