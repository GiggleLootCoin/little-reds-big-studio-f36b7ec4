import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

const root = join(process.cwd(), "dist", "client");
const assetRoot = join(root, "assets");
const files = await readdir(assetRoot);
const jsFiles = files.filter((file) => file.endsWith(".js"));
if (!jsFiles.length) {
  throw new Error("No production browser JavaScript assets were found.");
}

const assets = new Map(
  await Promise.all(
    jsFiles.map(async (file) => [file, await readFile(join(assetRoot, file), "utf8")]),
  ),
);

const shell = await readFile(join(root, "_shell.html"), "utf8").catch(() => "");
const entryPaths = [
  ...shell.matchAll(/(?:<script[^>]+src|<link[^>]+href)=["'](\/assets\/[^"']+\.js)["']/g),
].map((match) => match[1].slice("/assets/".length));
if (!entryPaths.length) {
  throw new Error("Could not identify a production browser JavaScript entry from dist/client/_shell.html.");
}

const resolveImport = (fromFile, specifier) => {
  if (!specifier.startsWith(".")) return null;
  const resolved = posix.normalize(posix.join("/assets", fromFile, "..", specifier));
  return resolved.startsWith("/assets/") ? resolved.slice("/assets/".length) : null;
};

const importsOf = (source) =>
  [...source.matchAll(/(?:from\s*|import\s*\()([`'\"])([^`'\"]+)\1/g)]
    .map((match) => match[2]);

const reachable = new Set();
const queue = entryPaths.filter((file) => assets.has(file));
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const specifier of importsOf(assets.get(file))) {
    const target = resolveImport(file, specifier);
    if (target && assets.has(target) && !reachable.has(target)) queue.push(target);
  }
}
if (!reachable.size) {
  throw new Error("Production browser JavaScript entry is present, but no emitted browser asset is reachable from it.");
}

const reachableAssets = [...reachable].map((file) => [file, assets.get(file)]);
const cloneEntries = reachableAssets.filter(([, source]) =>
  source.includes("/api/voice-clone") &&
  source.includes("Sending your actual reference recording to Qwen3-TTS") &&
  source.includes("__buddyLastCloneUrl") &&
  source.includes("Clone audio verified:"),
);
if (cloneEntries.length !== 1) {
  throw new Error(
    `Expected exactly one reachable production browser clone entry, found ${cloneEntries.length}.`,
  );
}

const [cloneAssetName, cloneSource] = cloneEntries[0];
const endpointIndex = cloneSource.indexOf("fetch(`/api/voice-clone`");
if (endpointIndex < 0) {
  throw new Error(`Production browser clone entry in ${cloneAssetName} does not contain the /api/voice-clone fetch.`);
}

const flow = cloneSource.slice(endpointIndex, endpointIndex + 7000);
for (const marker of ["audioBase64", "refText", ".blob()", "__buddyLastCloneUrl", "verification:"]) {
  if (!flow.includes(marker)) {
    throw new Error(
      `Production browser clone entry in ${cloneAssetName} is missing the compiled ${marker} step after /api/voice-clone.`,
    );
  }
}

const blobToVerifier = flow.match(
  /(?:let|const)\s+([A-Za-z_$][\\w$]*)=await\s+[A-Za-z_$][\\w$]*\.blob\(\).*?(?:let|const)\s+([A-Za-z_$][\\w$]*)=await\s+([A-Za-z_$][\\w$]*)\(\1\)/s,
);
if (!blobToVerifier) {
  throw new Error(
    `Production browser clone entry in ${cloneAssetName} converts the response to a Blob, but no compiled audio-verification call consuming that Blob was found.`,
  );
}

const verifierName = blobToVerifier[3];
const verifierDefinition = cloneSource.indexOf(`async function ${verifierName}(`);
if (verifierDefinition < 0) {
  throw new Error(
    `Production browser clone entry calls compiled audio verifier ${verifierName}(), but its implementation is not present in the reachable browser graph.`,
  );
}
const verifierSource = cloneSource.slice(verifierDefinition, verifierDefinition + 5000);
for (const marker of ["decodeAudioData", "new Blob", "URL.createObjectURL"]) {
  if (!verifierSource.includes(marker)) {
    throw new Error(
      `Compiled audio verifier ${verifierName}() is missing expected ${marker} behavior.`,
    );
  }
}

for (const [file, source] of reachableAssets) {
  if (source.includes("createLocalChatterboxClone")) {
    throw new Error(
      `Production browser clone graph contains obsolete createLocalChatterboxClone path in ${file}.`,
    );
  }
}

const obsoleteChatterboxWorker = files.filter(
  (file) => file.startsWith("chatterbox-local.worker-") && file.endsWith(".js"),
);
if (obsoleteChatterboxWorker.length) {
  throw new Error(
    `Production browser bundle contains obsolete Chatterbox voice worker asset(s): ${obsoleteChatterboxWorker.join(", ")}`,
  );
}

console.log(`Production browser clone entry verified in reachable asset: ${cloneAssetName}`);
console.log(
  "Compiled browser graph verified: production clone entry → /api/voice-clone → response.blob() → compiled audio normalization/verification → verified CloneResult; obsolete createLocalChatterboxClone is absent from the reachable production clone graph.",
);
