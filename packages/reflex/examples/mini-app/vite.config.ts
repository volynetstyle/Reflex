import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = __dirname;

export default defineConfig({
  root: rootDir,
  resolve: {
    conditions: ["source"],
  },
  define: {
    __DEV__: true,
    __TEST__: false,
    __PROD__: false,
  },
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
});
