import { useEffect, useState } from "react";
import {
  adoptSessionFromAuthHash,
  getProfile,
  getStoredSession,
  refreshSession,
  signOut as signOutRemote,
  type ProfileRecord,
  type SupabaseUser,
} from "@/lib/supabase-rest";
export type LocalUser = { id: string; email: string; user_metadata: { display_name: string } };
export type Profile = ProfileRecord;
const toUser = (u: SupabaseUser): LocalUser => ({
  id: u.id,
  email: u.email || "",
  user_metadata: { display_name: u.user_metadata?.display_name || "Creator" },
});
export function useAuth() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = getStoredSession();
      if (!s) {
        try {
          s = await adoptSessionFromAuthHash();
        } catch {
          s = null;
        }
      }
      if (s?.expires_at && s.expires_at * 1000 < Date.now() + 60000) s = await refreshSession();
      if (!cancelled && s?.user) setUser(toUser(s.user));
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { session: user ? { user } : null, user, ready };
}
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async (id: string) => {
    const s = getStoredSession();
    if (!s?.access_token) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const p = await getProfile(id, s.access_token);
      setProfile(p);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (userId) void load(userId);
    else setProfile(null);
  }, [userId]);
  return {
    profile,
    loading,
    setProfile,
    reload: () => (userId ? load(userId) : Promise.resolve()),
  };
}
export async function signOutLocal() {
  await signOutRemote();
  location.reload();
}
