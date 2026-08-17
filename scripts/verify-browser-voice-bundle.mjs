import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "dist");
const textExtensions = new Set([".js", ".mjs", ".html", ".css", ".json", ".map"]);
const forbidden = [
  "onnxruntime-node",
  "sharp",
  "rahul7star-chatterbox-multilingual-tts.hf.space",
  "spacekaren/chatterbox",
  "remote voice-clone fallback",
  "default voice fallback",
];
const required = ["ttslab/chatterbox-turbo-webgpu"];

async function collect(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path, files);
    else files.push(path);
  }
  return files;
}

const files = await collect(root);
const assets = files.filter((file) => textExtensions.has(file.slice(file.lastIndexOf("."))));
if (!assets.length) throw new Error("Production build contains no inspectable text assets.");

let combined = "";
for (const file of assets) combined += `\n${file}\n${await readFile(file, "utf8")}`;

for (const needle of required) {
  if (!combined.includes(needle)) throw new Error(`Browser voice bundle is missing required marker: ${needle}`);
}
for (const needle of forbidden) {
  if (combined.includes(needle)) throw new Error(`Browser production bundle contains forbidden marker: ${needle}`);
}

console.log(`Browser voice bundle verified: ${assets.length} inspectable assets scanned.`);
console.log("Chatterbox Turbo model marker is present; Node/native dependencies and public voice-Space fallback markers are absent.");
