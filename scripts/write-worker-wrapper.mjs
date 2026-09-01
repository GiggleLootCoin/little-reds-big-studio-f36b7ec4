import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await writeFile(
  "dist/server/worker-wrapper.js",
  `import worker from "../../src/worker.ts";\n\nexport default worker;\n`,
  "utf8",
);
