import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatedBackground } from "@/components/studio/AnimatedBackground";
import { StudioLogo } from "@/components/studio/StudioLogo";
import { Chip, Note } from "@/components/studio/ui";
import { getPublicStation, type PublicStation } from "@/lib/supabase-rest";

export const Route = createFileRoute("/station/$handle")({
  component: StationPage,
});

function StationPage() {
  const { handle } = Route.useParams();
  const [station, setStation] = useState<PublicStation | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPublicStation(handle)
      .then(setStation)
      .finally(() => setLoading(false));
  }, [handle]);

  return (
    <div className="relative min-h-[100svh] overflow-x-clip">
      <AnimatedBackground />
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 py-2">
          <Link to="/" aria-label="Back to Little Red's Big Studio">
            <StudioLogo compact />
          </Link>
          <Chip>Official Station</Chip>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        {loading ? (
          <Note>Loading Station…</Note>
        ) : !station ? (
          <section className="glass-panel rounded-3xl p-8 text-center">
            <Radio className="mx-auto size-8 text-primary" />
            <h1 className="mt-4 font-display text-2xl font-bold">Station not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This creator Station is private, unavailable, or the handle is incorrect.
            </p>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-border/60 bg-background/60 shadow-2xl backdrop-blur-xl">
              <div
                className="h-32 bg-gradient-to-br from-primary/30 via-background to-secondary/60 sm:h-44"
                style={
                  station.profile.banner_url
                    ? {
                        backgroundImage: `url(${station.profile.banner_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              />
              <div className="-mt-10 px-5 pb-6 sm:-mt-14 sm:px-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-end gap-4">
                    <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-secondary text-2xl font-bold sm:size-28">
                      {station.profile.avatar_url ? (
                        <img
                          src={station.profile.avatar_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        (station.profile.display_name || "C").slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="pb-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Official Station
                      </div>
                      <h1 className="font-display text-2xl font-bold sm:text-3xl">
                        {station.profile.station_name || station.profile.display_name}
                      </h1>
                      <div className="text-sm text-muted-foreground">@{station.profile.handle}</div>
                    </div>
                  </div>
                  {station.profile.website_url && (
                    <a
                      href={station.profile.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                    >
                      <ExternalLink className="size-3.5" /> Website
                    </a>
                  )}
                </div>
                {station.profile.bio && (
                  <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {station.profile.bio}
                  </p>
                )}
              </div>
            </section>
            <section className="mt-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Published
                  </div>
                  <h2 className="font-display text-xl font-bold">Creator work</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {station.items.length} {station.items.length === 1 ? "release" : "releases"}
                </span>
              </div>
              {station.items.length === 0 ? (
                <div className="glass-panel rounded-2xl p-6">
                  <Note>This Station has not published anything yet.</Note>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {station.items.map((item) => (
                    <article key={item.id} className="glass-panel overflow-hidden rounded-2xl">
                      <div className="aspect-video bg-secondary/60">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="grid size-full place-items-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {item.kind}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                          {item.kind}
                        </div>
                        <h3 className="mt-1 font-display text-base font-bold">{item.title}</h3>
                        {item.description && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        <a
                          href={item.asset_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
                        >
                          Open release <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
