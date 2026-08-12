import { useEffect, useState } from "react";
import { ExternalLink, Heart, Plug, UserCircle2, Users } from "lucide-react";
import { FREE_RUNNERS } from "@/lib/free-runners";
import { listPlugins } from "@/lib/plugins.functions";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { Panel, Note, Readout, StudioButton } from "./ui";
import { Field } from "./AiOutput";
import { FreeRunnerPanel } from "./FreeRunnerPanel";
import type { PublicPlugin } from "@/lib/plugins.registry.server";

export function SpotlightPanel() {
  return <Panel eyebrow="Module 12" title="Artist Spotlight — Local" icon={<Heart className="size-5" />}><Note>Your creator feed is local-first. Finished work can be saved to your account when signed in and shared through your normal publishing platform.</Note></Panel>;
}
export function ProfilePanel() {
  const { user } = useAuth();
  const { profile, setProfile } = useProfile(user?.id);
  if (!profile) return <Panel eyebrow="Module 13" title="Creator Profile" icon={<UserCircle2 className="size-5" />}><Note>Loading account profile…</Note></Panel>;
  return (
    <Panel eyebrow="Module 13" title="Creator Profile" icon={<UserCircle2 className="size-5" />}>
      <Field label="Display name" value={profile.display_name || ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
      <p className="text-xs text-muted-foreground">Your account profile is stored in Supabase. The trial and membership state are server-authoritative.</p>
      <StudioButton className="w-full" onClick={() => setProfile({ ...profile })}>Save profile</StudioButton>
    </Panel>
  );
}
export function AccessPanel() {
  return <Panel eyebrow="Account" title="Account & Privacy" icon={<Users className="size-5" />}><Readout label="Account" value="Supabase authentication" /><Readout label="AI API keys" value="None required for free routes" /><Readout label="Entitlement" value="Server-authoritative" /><Note>Projects and account data are scoped to the signed-in user. Browser storage is used only for lightweight UI/session continuity.</Note></Panel>;
}
export function EnginePanel() {
  return <Panel eyebrow="Execution" title="Free Execution Map" icon={<Plug className="size-5" />}><FreeRunnerPanel /><div className="grid gap-2">{FREE_RUNNERS.map((r) => <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3"><span className="text-sm">{r.name}</span><a href={r.url} target="_blank" rel="noreferrer" className="text-primary" aria-label={`Open ${r.name}`}><ExternalLink className="size-4" /></a></div>)}</div></Panel>;
}
export function SeoPanel() {
  return <Panel eyebrow="Module 15" title="YouTube SEO Workspace" icon={<Plug className="size-5" />}><Note>SEO generation is prepared as a free/open-model job and remains inside Buddy's orchestration layer rather than exposing provider machinery.</Note></Panel>;
}
function runnerUrlForPlugin(plugin: PublicPlugin) {
  const capability = plugin.capability === "text" ? "lyrics" : plugin.capability;
  return FREE_RUNNERS.find((runner) => runner.capabilities.includes(capability))?.url ?? plugin.projectUrl;
}
export function PluginPanel() {
  const [plugins, setPlugins] = useState<PublicPlugin[]>([]);
  useEffect(() => { listPlugins().then(setPlugins).catch(() => setPlugins([])); }, []);
  return <Panel eyebrow="Open Models" title="No-API Model Catalog" icon={<Plug className="size-5" />}><p className="text-sm text-muted-foreground">Open/free engines are selected backstage. This diagnostic catalog is for transparency; normal creation controls do not require model selection.</p><div className="grid gap-2">{plugins.map((p) => { const runnerUrl = runnerUrlForPlugin(p); return <div key={p.slug} className="rounded-xl border border-border bg-background/40 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-display text-sm">{p.name}</div><div className="text-xs text-muted-foreground">{p.capability} · {p.runtime}</div></div><span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{p.available ? "Ready" : "Free route"}</span></div>{runnerUrl && <a href={runnerUrl} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"><ExternalLink className="size-3.5" aria-hidden />Open free runner</a>}</div>; })}</div></Panel>;
}
export function SupportPanel() {
  return <Panel eyebrow="Free by design" title="Studio Support" icon={<Plug className="size-5" />}><Note>Little Red&apos;s Big Studio prioritizes open/free execution. Core creation does not require a paid AI gateway or provider API key.</Note></Panel>;
}
