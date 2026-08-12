import { useEffect, useState } from "react";
import {
  adoptSessionFromAuthHash,
  getEntitlement,
  getProfile,
  getStoredSession,
  refreshSession,
  signOut as signOutRemote,
  type Entitlement,
  type SupabaseUser,
} from "@/lib/supabase-rest";

export type LocalUser = {
  id: string;
  email: string;
  user_metadata: { display_name: string };
};

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  about: string;
  avatar_url: string | null;
  banner_url: string | null;
};

function toLocalUser(user: SupabaseUser): LocalUser {
  return {
    id: user.id,
    email: user.email || "",
    user_metadata: { display_name: user.user_metadata?.display_name || "Creator" },
  };
}

export function useAuth() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      let session = getStoredSession();
      if (!session) {
        try {
          session = await adoptSessionFromAuthHash();
        } catch {
          session = null;
        }
      }
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
        session = await refreshSession();
      }
      if (!cancelled) setUser(session?.user ? toLocalUser(session.user) : null);
      if (!cancelled) setReady(true);
    };
    void boot();
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
    const session = getStoredSession();
    if (!session?.access_token) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const remote = await getProfile(id, session.access_token);
      if (remote) setProfile(remote as Profile);
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

export function useEntitlement(userId: string | undefined) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    const session = getStoredSession();
    if (!userId || !session?.access_token) {
      setEntitlement(null);
      return;
    }
    setLoading(true);
    try {
      setEntitlement(await getEntitlement(session.access_token));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [userId]);

  return { entitlement, loading, reload };
}

export async function signOutLocal() {
  await signOutRemote();
  window.location.reload();
}
