import { useEffect, useState } from "react";
import {
  getEntitlement,
  getStoredSession,
  refreshSession,
  type Entitlement,
} from "@/lib/supabase-rest";
export function useEntitlement() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = getStoredSession();
      if (s?.expires_at && s.expires_at * 1000 < Date.now() + 60000) s = await refreshSession();
      if (s?.access_token) {
        try {
          const e = await getEntitlement(s.access_token);
          if (!cancelled) setEntitlement(e);
        } catch {
          if (!cancelled) setEntitlement(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    entitlement,
    ready,
    trialActive: !!entitlement?.trial_active,
    unlimited: !!entitlement?.unlimited,
    buddyUnleashed: !!entitlement?.buddy_unleashed,
  };
}
