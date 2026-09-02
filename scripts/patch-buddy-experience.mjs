import fs from "node:fs";

const pickerPath = "src/components/studio/BuddyVoicePicker.tsx";
const chatPath = "src/components/studio/BuddyLiveChat.tsx";
const agentPath = "src/lib/buddy-agent.ts";

function replaceOnce(path, from, to, label) {
  const text = fs.readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  fs.writeFileSync(path, text.replace(from, to));
}

function patchSavedRedSelection() {
  const text = fs.readFileSync(pickerPath, "utf8");
  const red = text.indexOf('speaker: "Red",');
  const mode = text.lastIndexOf('mode: "clone" as const,', red);
  if (red < 0 || mode < 0) throw new Error("Missing patch anchor: saved Red selection");
  const speakerEnd = red + 'speaker: "Red",'.length;
  const next = text.slice(0, mode) + 'mode: "preset" as const,\n          speaker: "Red",' + text.slice(speakerEnd);
  fs.writeFileSync(pickerPath, next);
}

patchSavedRedSelection();
replaceOnce(
  pickerPath,
  'next.mode === "clone"\n        ? next.cloneVerified',
  'next.mode === "clone" || next.speaker === "Red"\n        ? next.cloneVerified',
  "Red uses clone status even in preset mode",
);
replaceOnce(
  chatPath,
  'const IDENTITY =\n  "You are Buddy, Little Red\'s personal creative studio companion. Your name is Buddy. Never identify yourself as Qwen, an AI model, a provider, or another assistant. Do not mention hidden model/provider machinery unless explicitly asked. Speak naturally, directly and helpfully. When an image is attached, actually inspect it and answer what you can see. Use conversation context when provided.";',
  'const IDENTITY =\n  "You are Buddy, Little Red\'s personal creative studio companion. Your name is Buddy. Never identify yourself as Qwen, an AI model, a provider, or another assistant. Do not mention hidden model/provider machinery unless explicitly asked. Speak like a real, attentive person: natural, concise, warm, direct, and quick to the useful point. Avoid canned filler, repetitive greetings, unnecessary disclaimers, and long preambles. Match the user\'s energy without becoming theatrical. When an image is attached, actually inspect it and answer what you can see. Use conversation context when provided.";',
  "more natural Buddy identity",
);
replaceOnce(
  chatPath,
  '      const history = [{ role: "system", content: IDENTITY }, ...prior, { role: "user", content }];\n      const r = await runStudioJob(\n          "chat",\n          { prompt: clean, text: clean, messages: history, history },',
  '      const voiceProfile = getBuddyVoiceProfile();\n      const language = voiceProfile.language || "English";\n      const mood = voiceProfile.mood || "natural";\n      const tone = voiceProfile.tone || "conversational";\n      const systemPrompt = `${IDENTITY} Respond in ${language}. Your current mood is ${mood}; your conversational tone is ${tone}. Keep replies compact when the user asks something simple, but give enough detail when the task needs it. Do not switch back to English unless the user asks for English.`;\n      const history = [{ role: "system", content: systemPrompt }, ...prior, { role: "user", content }];\n      const r = await runStudioJob(\n          "chat",\n          { prompt: clean, text: clean, messages: history, history, language, mood, tone },',
  "forward language mood tone into chat",
);
replaceOnce(
  chatPath,
  '            language: v.language || "English",\n            use_xvector_only: !v.referenceTranscript,',
  '            language: v.language || "English",\n            mood: v.mood || "natural",\n            tone: v.tone || "conversational",\n            use_xvector_only: !v.referenceTranscript,',
  "forward mood tone into Red voice generation",
);
replaceOnce(
  chatPath,
  '          "tts",\n          { text, target_text: text, language: v.language || "English", speaker: v.speaker },',
  '          "tts",\n          { text, target_text: text, language: v.language || "English", speaker: v.speaker, mood: v.mood || "natural", tone: v.tone || "conversational" },',
  "forward mood tone into preset voice generation",
);
replaceOnce(
  agentPath,
  '    "Return a concise natural reply plus a machine-readable action plan when creation work is requested.",',
  '    "Return a concise, natural, human-sounding reply; answer simple questions quickly and avoid filler or long preambles.",\n    "Respect the selected language, mood, and conversational tone when they are supplied.",',
  "faster natural agent personality",
);
console.log("Buddy experience production patch applied.");
