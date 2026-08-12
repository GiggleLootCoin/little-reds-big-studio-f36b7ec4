import { ExternalLink, Smartphone, Zap } from "lucide-react";
import { runnersFor } from "@/lib/free-runners";
import { Panel, StudioButton } from "./ui";

export function FreeRunnerPanel({ capability }: { capability?: string }) {
  const runners = runnersFor(capability ?? "");

  return (
    <Panel
      eyebrow="Free • No API key"
      title="Free AI Routes"
      icon={<Zap className="size-5" />}
      defaultOpen
    >
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-medium">Use the best free route for this job.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Heavy models run in a separate browser tab. The Studio prepares your workflow and never
          requires a paid provider key.
        </p>
      </div>

      <div className="grid gap-2">
        {runners.map((runner, index) => (
          <article key={runner.id} className="rounded-xl border border-border bg-background/50 p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {runner.kind === "android" ? (
                  <Smartphone className="size-4" />
                ) : (
                  <Zap className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-semibold">{runner.name}</h3>
                  {index === 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Best free route
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{runner.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{runner.notes}</p>
              </div>
            </div>
            {runner.url.startsWith("/api/ai/") ? (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center text-[11px] text-muted-foreground">
                Used automatically by the Studio — no API key or separate tab required.
              </div>
            ) : (
              <StudioButton
                className="mt-3 w-full"
                onClick={() => window.open(runner.url, "_blank", "noopener,noreferrer")}
              >
                Open & run <ExternalLink className="size-3.5" />
              </StudioButton>
            )}
          </article>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Keep the Studio open while a public GPU runner works, then import the finished file back
        into your project. Public free GPU availability can change, so the runtime validates the
        result and falls back when possible.
      </p>
    </Panel>
  );
}
