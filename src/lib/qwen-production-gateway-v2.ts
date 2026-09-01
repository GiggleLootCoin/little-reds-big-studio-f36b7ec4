import { parseProductionQwenSSE } from "./qwen-production-gateway.ts";

export function parseQwenCompletionPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload[0] ?? undefined;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["url", "path", "audio", "file", "fileData", "data"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const nested = parseQwenCompletionPayload(value);
        if (nested !== undefined) return nested;
      }
    }
    if (Array.isArray(record.data)) return parseQwenCompletionPayload(record.data);
  }
  return undefined;
}

export function parseQwenStreamWithObjectSupport(stream: string): {
  audio?: unknown;
  error?: string;
} {
  const base = parseProductionQwenSSE(stream);
  if (base.audio !== undefined || base.error) return base;
  let event = "";
  let data: string[] = [];
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) {
      if (event === "complete" && data.length) {
        try {
          const payload = JSON.parse(data.join("\n").trim()) as unknown;
          const audio = parseQwenCompletionPayload(payload);
          if (audio !== undefined) return { audio };
        } catch {
          return { error: "Qwen returned malformed completion data." };
        }
      }
      event = "";
      data = [];
      continue;
    }
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (event === "complete" && data.length) {
    try {
      const audio = parseQwenCompletionPayload(JSON.parse(data.join("\n").trim()) as unknown);
      if (audio !== undefined) return { audio };
    } catch {
      return { error: "Qwen returned malformed completion data." };
    }
  }
  return {};
}
