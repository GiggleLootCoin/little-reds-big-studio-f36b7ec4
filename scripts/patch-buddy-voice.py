from pathlib import Path

path = Path('src/components/studio/BuddyLiveChat.tsx')
text = path.read_text()

if 'from "@/lib/buddy-voice"' not in text:
    text = text.replace('import "./BuddyVisual.css";', 'import "./BuddyVisual.css";\nimport { BuddyVoicePicker } from "./BuddyVoicePicker";\nimport { getBuddyVoiceProfile } from "@/lib/buddy-voice";', 1)

old = 'const result = await runStudioJob("tts", { text, target_text: text }, setStatus);'
new = '''const voice = getBuddyVoiceProfile();
      const voiceInput: Record<string, unknown> = {
        text,
        target_text: text,
        language: voice.language,
        ...(voice.mode === "clone" && voice.referenceDataUrl
          ? { referenceAudio: await (await fetch(voice.referenceDataUrl)).blob() }
          : { speaker: voice.speaker }),
      };
      const result = await runStudioJob("tts", voiceInput, setStatus);'''
if old in text:
    text = text.replace(old, new, 1)

marker = '<div className="relative mt-5 grid gap-3 sm:grid-cols-2">'
if '<BuddyVoicePicker />' not in text and marker in text:
    text = text.replace(marker, '<BuddyVoicePicker />\n        ' + marker, 1)

path.write_text(text)
