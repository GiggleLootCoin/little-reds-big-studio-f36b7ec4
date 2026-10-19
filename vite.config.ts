import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import { resolve } from "node:path";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "/",
  plugins: [tanstackStart({ spa: { enabled: true } }), tailwindcss(), tsconfigPaths(), viteReact()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), "index.html"),
        android: resolve(process.cwd(), "android.html"),
      },
    },
  },
});
