import { useEffect, useState } from "react";
import { ExternalLink, Radio, Trash2 } from "lucide-react";
import { useAuth, useProfile } from "@/hooks/use-auth";
import {
  deleteStationItem,
  getMyStationItems,
  getStoredSession,
  publishStationItem,
  updateProfile,
  type StationItem,
} from "@/lib/supabase-rest";
import { Note, Panel, Readout, StudioButton } from "./ui";

export function OfficialStationPanel() {
  const { user } = useAuth();
  const { profile, setProfile } = useProfile(user?.id);
  const [items, setItems] = useState<StationItem[]>([]);
  const [handle, setHandle] = useState("");
  const [stationName, setStationName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [kind, setKind] = useState<StationItem["kind"]>("music");
  const [error, setError] = useState("");

  useEffect(() => {
    setHandle(profile?.handle || "");
    setStationName(profile?.station_name || profile?.display_name || "Official Station");
    setBio(profile?.bio || "");
  }, [profile?.handle, profile?.station_name, profile?.display_name, profile?.bio]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.access_token || !user?.id) return;
    getMyStationItems(session.access_token, user.id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [user?.id]);

  if (!profile) {
    return (
      <Panel eyebrow="Creator" title="Official Station" icon={<Radio className="size-5" />}>
        <Note>Sign in to create and manage your Official Station.</Note>
      </Panel>
    );
  }

  const save = async () => {
    const session = getStoredSession();
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    try {
      const next = await updateProfile(
        profile.id,
        {
          handle: handle.trim().toLowerCase(),
          station_name: stationName.trim() || profile.display_name,
          bio: bio.trim(),
        },
        session.access_token,
      );
      if (next) setProfile(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the Station profile.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    const session = getStoredSession();
    if (!session?.access_token || !user?.id) return;
    setPublishing(true);
    setError("");
    try {
      const item = await publishStationItem(session.access_token, {
        user_id: user.id,
        kind,
        title: title.trim(),
        description: "",
        asset_url: assetUrl.trim(),
        thumbnail_url: null,
        metadata: {},
      });
      setItems((current) => [item, ...current]);
      setTitle("");
      setAssetUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Station could not publish this item.");
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (id: string) => {
    const session = getStoredSession();
    if (!session?.access_token) return;
    await deleteStationItem(session.access_token, id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <Panel
      eyebrow="Creator Channel"
      title="Official Station"
      icon={<Radio className="size-5" />}
      defaultOpen
    >
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold">
            <span>Station handle</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            <span>Station name</span>
            <input
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs font-semibold">
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="resize-y rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <StudioButton disabled={saving || !handle.trim()} onClick={() => void save()}>
          {saving ? "Saving…" : "Save Station profile"}
        </StudioButton>
        <Readout label="Public Station" value={handle ? `/station/${handle}` : "Choose a handle"} />

        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.18em]">
            Publish a finished artifact
          </div>
          <div className="grid gap-2 sm:grid-cols-[0.7fr_1fr]">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StationItem["kind"])}
              className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm"
            >
              <option value="music">Music</option>
              <option value="video">Video</option>
              <option value="artwork">Artwork</option>
              <option value="beat">Beat</option>
              <option value="other">Other</option>
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Release / project title"
              className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <input
            value={assetUrl}
            onChange={(e) => setAssetUrl(e.target.value)}
            placeholder="Real artifact URL"
            className="mt-2 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Publishing requires an actual playable/viewable artifact URL. Placeholder job IDs are
            rejected.
          </p>
          <StudioButton
            className="mt-2 w-full"
            disabled={publishing || !title.trim() || !assetUrl.trim()}
            onClick={() => void publish()}
          >
            {publishing ? "Publishing…" : "Publish to Official Station"}
          </StudioButton>
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {item.kind} · {item.visibility}
                </div>
              </div>
              <a
                href={item.asset_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${item.title}`}
                className="text-primary"
              >
                <ExternalLink className="size-4" />
              </a>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                aria-label={`Delete ${item.title}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
