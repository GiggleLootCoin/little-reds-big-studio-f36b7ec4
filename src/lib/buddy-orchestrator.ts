import { runnersFor, type FreeRunner } from "@/lib/free-runners";
import { redCognitiveSystemPrompt } from "@/lib/buddy-red-cognitive-core";
import { setBuddyStatus } from "@/lib/buddy-presence";

export type BuddyTask = "writing" | "voice" | "music" | "stems" | "artwork" | "video";
export type BuddyCognitiveMode = "creative" | "conversation" | "research";

export type BuddyPlan = {
  task: BuddyTask;
  mode: "local" | "free-open" | "unavailable";
  label: string;
  runner: FreeRunner | null;
  fallbacks: FreeRunner[];
  reason: string;
  cognitiveMode: BuddyCognitiveMode;
  cognitivePrompt: string;
  requiresArtifactValidation: true;
};

const CAPABILITY: Record<BuddyTask, string> = {
  writing: "chat",
  voice: "tts",
  music: "music",
  stems: "stems",
  artwork: "image",
  video: "video",
};

function localCapability(_task: BuddyTask): boolean {
  return false;
}

function rankFreeRoutes(task: BuddyTask): FreeRunner[] {
  return runnersFor(CAPABILITY[task]);
}

/**
 * Buddy plans from the desired outcome first. Route policy is internal-only:
 * users see the result, never provider/model/API/hosting/pricing details.
 */
export function buddyPlan(
  task: BuddyTask,
  cognitiveMode: BuddyCognitiveMode = task === "writing" ? "conversation" : "creative",
): BuddyPlan {
  const routes = rankFreeRoutes(task);
  const runner = routes[0] ?? null;
  const cognitivePrompt = redCognitiveSystemPrompt(cognitiveMode);

  if (localCapability(task)) {
    return {
      task,
      mode: "local",
      label: "Ready on this device",
      runner: null,
      fallbacks: [],
      reason: "Buddy can complete this part of the workflow locally.",
      cognitiveMode,
      cognitivePrompt,
      requiresArtifactValidation: true,
    };
  }

  if (runner) {
    return {
      task,
      mode: "free-open",
      label: "Buddy will handle it",
      runner,
      fallbacks: routes.slice(1),
      reason: "Buddy selected an internal execution route and will verify the real result before reporting success.",
      cognitiveMode,
      cognitivePrompt,
      requiresArtifactValidation: true,
    };
  }

  return {
    task,
    mode: "unavailable",
    label: "Buddy needs another route",
    runner: null,
    fallbacks: [],
    reason: "No suitable internal execution route is currently configured for this task.",
    cognitiveMode,
    cognitivePrompt,
    requiresArtifactValidation: true,
  };
}

export function buddyKnowledge(mode: BuddyCognitiveMode = "conversation") {
  return redCognitiveSystemPrompt(mode);
}

/**
 * Compatibility helper for older UI entry points. It reports orchestration
 * state but deliberately does not claim that merely opening a provider page
 * completed the requested creative operation.
 */
export function openBuddyRoute(task: BuddyTask) {
  const plan = buddyPlan(task);

  if (plan.mode === "unavailable") {
    setBuddyStatus("error", {
      task,
      message: "That route isn't configured yet. I won't pretend otherwise.",
    });
    return plan;
  }

  if (plan.mode === "local") {
    setBuddyStatus("working", { task, message: null });
    return plan;
  }

  if (plan.runner && typeof window !== "undefined") {
    setBuddyStatus("working", {
      task,
      message: "Buddy is handling that now. I’ll tell you when there is a real result.",
    });
    window.open(plan.runner.url, "_blank", "noopener,noreferrer");
  }

  return plan;
}
