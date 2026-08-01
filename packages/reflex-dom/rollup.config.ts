import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import type { Plugin, RollupOptions, RollupWarning } from "rollup";
import { dts } from "rollup-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const frameworkDist = resolve(packageRoot, "../reflex-framework/dist");
const runtimeDist = resolve(packageRoot, "../reflex-runtime/dist");

function workspacePackages(types = false): Plugin {
  const entries = new Map([
    [
      "@volynets/reflex-framework",
      resolve(frameworkDist, types ? "index.d.ts" : "index.js"),
    ],
    [
      "@volynets/reflex-framework/jsx-runtime",
      resolve(frameworkDist, types ? "jsx-runtime.d.ts" : "jsx-runtime.js"),
    ],
    [
      "@volynets/reflex-framework/jsx-dev-runtime",
      resolve(
        frameworkDist,
        types ? "jsx-dev-runtime.d.ts" : "jsx-dev-runtime.js",
      ),
    ],
    [
      "@volynets/reflex-runtime",
      resolve(
        runtimeDist,
        types ? "esm/src/index.d.ts" : "esm/index.js",
      ),
    ],
    [
      "@volynets/reflex-runtime/internal",
      resolve(
        runtimeDist,
        types ? "esm/src/internal/index.d.ts" : "esm/internal.js",
      ),
    ],
  ]);

  return {
    name: "reflex-workspace-packages",
    resolveId(source) {
      return entries.get(source) ?? null;
    },
  };
}

function failOnUnresolvedImport(warning: RollupWarning): void {
  if (warning.code === "UNRESOLVED_IMPORT") {
    throw new Error(warning.message);
  }
}

const javascript: RollupOptions = {
  input: "dist/index.js",
  output: {
    file: "build/bundle/index.js",
    format: "esm",
    sourcemap: false,
  },
  plugins: [
    workspacePackages(),
    replace({
      preventAssignment: true,
      values: {
        __DEV__: "false",
        __PROFILE__: "false",
        __TEST__: "false",
        __PROD__: "true",
        __TRACKING_ONE_HOP__: "true",
        __TRACKING_TWO_HOP__: "true",
        __TRACKING_LAST_EDGE__: "true",
      },
    }),
    terser({
      compress: {
        passes: 2,
        module: true,
        toplevel: true,
        dead_code: true,
        drop_debugger: true,
      },
      mangle: { module: true, toplevel: true },
      format: { comments: false },
      module: true,
      ecma: 2022,
    }),
    nodeResolve({ extensions: [".js"], exportConditions: ["import", "default"] }),
  ],
  external: [],
  onwarn: failOnUnresolvedImport,
  treeshake: {
    preset: "recommended",
    moduleSideEffects: false,
  },
};

const declarations: RollupOptions = {
  input: "dist/index.d.ts",
  output: { file: "build/bundle/index.d.ts", format: "esm" },
  plugins: [workspacePackages(true), dts()],
  external: [],
  onwarn: failOnUnresolvedImport,
};

export default [javascript, declarations];
