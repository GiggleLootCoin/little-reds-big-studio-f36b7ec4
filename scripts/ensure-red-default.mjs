import fs from "node:fs";

const path = "src/lib/buddy-voice.ts";
let content = fs.readFileSync(path, "utf8");

if (!content.includes('const RED_DEFAULT_MIGRATION_KEY')) {
  const replaced = content.replace(
    /const DEFAULT_PROFILE: BuddyVoiceProfile = \{[\s\S]*?\n\};/,
    `const RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v1";
const DEFAULT_PROFILE: BuddyVoiceProfile = {
  mode: "preset",
  speaker: "Red",
  language: "English",
  mood: "natural",
  tone: "conversational",
};`,
  );
  if (replaced === content) throw new Error("DEFAULT_PROFILE block not found");
  content = replaced;
}

if (!content.includes("localStorage.getItem(RED_DEFAULT_MIGRATION_KEY)")) {
  const anchor = "    const selected = parsed ?? legacyProfile();";
  const start = content.indexOf(anchor);
  const returnIndex = start >= 0 ? content.indexOf("return {", start) : -1;
  if (start < 0 || returnIndex < 0) throw new Error("getBuddyVoiceProfile anchor not found");
  const migration = `    const migrated = localStorage.getItem(RED_DEFAULT_MIGRATION_KEY) !== "1";
    if (migrated) {
      const redDefault = {
        ...DEFAULT_PROFILE,
        language: selected?.language || DEFAULT_PROFILE.language,
        mood: selected?.mood || DEFAULT_PROFILE.mood,
        tone: selected?.tone || DEFAULT_PROFILE.tone,
      };
      localStorage.setItem(RED_DEFAULT_MIGRATION_KEY, "1");
      saveBuddyVoiceProfile(redDefault);
      return redDefault;
    }
`;
  content = content.slice(0, returnIndex) + migration + content.slice(returnIndex);
}

fs.writeFileSync(path, content);
console.log("Red voice default migration applied.");
