import { sourceAliases } from "../../../../tooling/configs/source-aliases";
import { applicationFlags, runtimeFlags } from "../../../../tooling/configs/runtime-flags";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = __dirname;

export default defineConfig(({ command }) => ({
  root: rootDir,
  resolve: {
    // Source execution needs a complete kernel graph; app builds consume package artifacts.
    conditions: command === "serve" ? ["source"] : [],
    alias: command === "serve" ? sourceAliases("application") : [],
  },
  define: command === "serve" ? runtimeFlags("development") : applicationFlags(),
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "@volynets/reflex-dom",
  },
  server: {
    open: false,
    port: 4174,
  },
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
}));
