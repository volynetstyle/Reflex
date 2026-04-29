import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import reflex from "@reflex/vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reflex({ dom: true }), tailwindcss()],
  //
  root: rootDir,
  //
  resolve: {
    conditions: ["source"],
  },
  //
  define: {
    __DEV__: true,
    __TEST__: false,
    __PROD__: false,
  },
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
});
