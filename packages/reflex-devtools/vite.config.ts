import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import reflex from "@reflex/vite-plugin";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reflex({ dom: true })],
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
    port: 4174,
  },
  //
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
});
