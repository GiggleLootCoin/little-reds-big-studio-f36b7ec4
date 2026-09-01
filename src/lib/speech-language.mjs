const LANGUAGE_CODES = {
  english: "en",
  french: "fr",
  german: "de",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  mandarin: "zh",
  russian: "ru",
  arabic: "ar",
  hindi: "hi",
};

export function normalizeSpeechLanguage(language) {
  const value = String(language || "").trim();
  if (!value || value.toLowerCase() === "auto") return undefined;
  const key = value.toLowerCase();
  return LANGUAGE_CODES[key] || key;
}
