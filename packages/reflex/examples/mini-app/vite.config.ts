import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = __dirname;
const workspaceDir = resolve(rootDir, "../../..");

function fromWorkspace(path: string): string {
  return resolve(workspaceDir, path);
}

const aliasMap = {
  "@volynets/reflex-dom/jsx-runtime": "reflex-dom/src/jsx-runtime.ts",
  "@volynets/reflex-dom/jsx-dev-runtime": "reflex-dom/src/jsx-dev-runtime.ts",
  "@volynets/reflex-framework/jsx-runtime":
    "reflex-framework/src/jsx-runtime.ts",
  "@volynets/reflex-framework/jsx-dev-runtime":
    "reflex-framework/src/jsx-dev-runtime.ts",
  "@volynets/reflex-framework/ownership/reflex":
    "reflex-framework/src/ownership/reflex.ts",
  "@volynets/reflex-framework/ownership":
    "reflex-framework/src/ownership/index.ts",
  "@volynets/reflex/unstable": "reflex/src/unstable/index.ts",
  "@reflex/runtime": "@reflex/runtime/src/index.ts",
  "@volynets/reflex-dom": "reflex-dom/src/index.ts",
  "@volynets/reflex-framework": "reflex-framework/src/index.ts",
  "@volynets/reflex": "reflex/src/index.ts",
};

const alias = Object.entries(aliasMap).map(([find, replacement]) => ({
  find,
  replacement: fromWorkspace(replacement),
}));

export default defineConfig({
  root: rootDir,
  resolve: { alias },
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
