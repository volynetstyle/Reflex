import { sourceAliases } from "../../tooling/configs/source-aliases";
import { applicationFlags, runtimeFlags } from "../../tooling/configs/runtime-flags";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import reflex from "@volynets/reflex-vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [reflex({ dom: true }), tailwindcss()],
  //
  root: rootDir,
  //
  resolve: {
    // Source execution needs a complete kernel graph; app builds consume package artifacts.
    conditions: command === "serve" ? ["source"] : ["development"],
    alias: command === "serve" ? sourceAliases("application") : [],
  },
  //
  define: command === "serve" ? runtimeFlags("development") : applicationFlags(),
  //
  server: {
    open: false,
    port: 1000,
  },
  //
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
}));
