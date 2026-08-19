import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FREE_RUNNERS } from "./free-runners";

const HOUSE_STYLE =
  "Little Red's Big Studio: crimson-lit, cinematic, direct, warm, radio-ready, creator-first.";
const runnerHint = (capability: string) => {
  const runner = FREE_RUNNERS.find((r) => r.capabilities.includes(capability)) || FREE_RUNNERS[0];
  return `\n\n### Free execution\nThis Studio does not call a paid AI API. Open **${runner.name}** and paste the prepared prompt: ${runner.url}`;
};
const prepared = (title: string, prompt: string, capability: string) =>
  `## ${title}\n\n${prompt}\n\n_${HOUSE_STYLE}_` + runnerHint(capability);

export const critiqueSong = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().default(""),
        genre: z.string().default(""),
        lyrics: z.string().default(""),
        notes: z.string().default(""),
        honesty: z.number().default(85),
        depth: z.number().default(70),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    critique: prepared(
      "Free AI Song Coach Job",
      `Critique this song idea. Honesty ${data.honesty}/100; depth ${data.depth}/100.\nTitle: ${data.title}\nGenre: ${data.genre}\nNotes: ${data.notes}\nLyrics:\n${data.lyrics}\nReturn: verdict/10, strengths, weaknesses, specific lyric/arrangement alternatives, mix targets, next 3 moves.`,
      `text`,
    ),
  }));
export const writeLyrics = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        theme: z.string().min(1),
        genre: z.string().default("cinematic pop"),
        mood: z.string().default("triumphant"),
        explicit: z.boolean().default(false),
        rhyme: z.number().default(80),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    lyrics: prepared(
      "Free Lyrics Job",
      `Write a full song about ${data.theme}. Genre ${data.genre}; mood ${data.mood}; rhyme density ${data.rhyme}/100; explicit=${data.explicit}. Include Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Final Chorus and Outro, followed by performance notes.`,
      `text`,
    ),
  }));
export const councilChat = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        messages: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
          .min(1),
        seats: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    reply: prepared(
      "Free Council Job",
      `Act as a council of specialists: ${data.seats.join(", ") || "songwriter, producer, director, vocal coach and growth strategist"}. Synthesize one decisive answer to:\n${data.messages.map((m: { role: "user" | "assistant"; content: string }) => `${m.role}: ${m.content}`).join("\n")}`,
      `text`,
    ),
  }));
export const buildStoryboard = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().default(""),
        direction: z.string().min(1),
        bpm: z.number().default(120),
        durationSec: z.number().default(180),
        scenes: z.number().default(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    storyboard: prepared(
      "Free Storyboard Job",
      `Create exactly ${data.scenes} shot-by-shot music-video scenes for ${data.title}. ${data.bpm} BPM, ${data.durationSec}s. Direction: ${data.direction}. For each scene provide time/bars, shot, action, lighting/palette and a dense video prompt.`,
      `video`,
    ),
  }));
export const generateSeo = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        title: z.string(),
        artist: z.string().default(""),
        genre: z.string().default(""),
        vibe: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    seo: prepared(
      "Free YouTube SEO Job",
      `For ${data.title} by ${data.artist}, genre ${data.genre}, vibe ${data.vibe}: return 5 titles under 70 chars, a full description, 20 tags and 8 hashtags.`,
      `text`,
    ),
  }));
export const generateArtwork = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3),
        reference: z.string().optional(),
        kind: z.enum(["avatar", "banner", "cover"]).default("avatar"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ({
    url: `https://huggingface.co/spaces?category=image-generation&search=${encodeURIComponent(data.prompt)}`,
    prompt: `Create ${data.kind}: ${data.prompt}. Use Buddy reference when supplied: ${data.reference || "none"}.`,
  }));
