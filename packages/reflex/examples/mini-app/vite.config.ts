import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = __dirname;
const workspaceDir = resolve(rootDir, "../../..");

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: [
      {
        find: "@volynets/reflex-dom/jsx-runtime",
        replacement: resolve(workspaceDir, "reflex-dom/src/jsx-runtime.ts"),
      },
      {
        find: "@volynets/reflex-dom/jsx-dev-runtime",
        replacement: resolve(workspaceDir, "reflex-dom/src/jsx-dev-runtime.ts"),
      },
      {
        find: "@volynets/reflex-framework/jsx-runtime",
        replacement: resolve(
          workspaceDir,
          "reflex-framework/src/jsx-runtime.ts",
        ),
      },
      {
        find: "@volynets/reflex-framework/jsx-dev-runtime",
        replacement: resolve(
          workspaceDir,
          "reflex-framework/src/jsx-dev-runtime.ts",
        ),
      },
      {
        find: "@volynets/reflex-framework/ownership/reflex",
        replacement: resolve(
          workspaceDir,
          "reflex-framework/src/ownership/reflex.ts",
        ),
      },
      {
        find: "@volynets/reflex-framework/ownership",
        replacement: resolve(
          workspaceDir,
          "reflex-framework/src/ownership/index.ts",
        ),
      },
      {
        find: "@volynets/reflex/unstable",
        replacement: resolve(workspaceDir, "reflex/src/unstable/index.ts"),
      },
      {
        find: "@reflex/runtime",
        replacement: resolve(workspaceDir, "@reflex/runtime/src/index.ts"),
      },
      {
        find: "@volynets/reflex-dom",
        replacement: resolve(workspaceDir, "reflex-dom/src/index.ts"),
      },
      {
        find: "@volynets/reflex-framework",
        replacement: resolve(workspaceDir, "reflex-framework/src/index.ts"),
      },
      {
        find: "@volynets/reflex",
        replacement: resolve(workspaceDir, "reflex/src/index.ts"),
      },
    ],
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
