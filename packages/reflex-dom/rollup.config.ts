import { runtimeReplacements } from "../../tooling/configs/runtime-flags.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import type { Plugin, RollupOptions } from "rollup";
import { dts } from "rollup-plugin-dts";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const frameworkDist = resolve(packageRoot, "../reflex-framework/dist");
const runtimeDist = resolve(packageRoot, "../reflex-runtime/dist");
const runtimeModules = resolve(packageRoot, "../reflex-runtime/build/esm/src");
const schedulerDist = resolve(packageRoot, "../reflex-scheduler/dist");

const external = (id: string) =>
  [
    "@volynets/reflex-runtime",
    "@volynets/reflex-framework",
    "@volynets/reflex-scheduler",
  ].some((name) => id === name || id.startsWith(`${name}/`));

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
      types
        ? resolve(runtimeDist, "esm/src/index.d.ts")
        : resolve(runtimeModules, "index.js"),
    ],
    [
      "@volynets/reflex-runtime/internal",
      types
        ? resolve(runtimeDist, "esm/src/internal/index.d.ts")
        : resolve(runtimeModules, "internal/index.js"),
    ],
    [
      "@volynets/reflex-scheduler",
      resolve(schedulerDist, types ? "index.d.ts" : "index.js"),
    ],
  ]);

  return {
    name: "reflex-workspace-packages",
    resolveId(source) {
      // Public/internal runtime entrypoints must share the same module graph.
      // Bundling their standalone bundles embeds two independent runtime states.
      return entries.get(source) ?? null;
    },
  };
}

function standalone(): Plugin {
  return {
    name: "reflex-standalone",
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (this.getModuleInfo(id)?.isExternal) {
          this.error(
            `Standalone output cannot depend on external module: ${id}`,
          );
        }
      }
    },
  };
}

const entries = ["index", "jsx-runtime", "jsx-dev-runtime"];
const onwarn: RollupOptions["onwarn"] = (warning, warn) => {
  if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
  warn(warning);
};

function javascript(isStandalone: boolean): RollupOptions {
  return {
    input: Object.fromEntries(
      entries.map((name) => [name, `build/esm/${name}.js`]),
    ),
    output: {
      dir: isStandalone ? "build/bundle/standalone" : "build/bundle",
      entryFileNames: "[name].js",
      chunkFileNames: "chunks/[name]-[hash].js",
      format: "esm",
      sourcemap: false,
    },
    plugins: [
      ...(isStandalone ? [workspacePackages()] : []),
      nodeResolve({
        extensions: [".js"],
        exportConditions: ["import", "default"],
      }),
      replace({
        preventAssignment: true,
        values: runtimeReplacements("production"),
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
      ...(isStandalone ? [standalone()] : []),
    ],
    external: isStandalone ? [] : external,
    onwarn,
    treeshake: {
      preset: "recommended",
      moduleSideEffects: false,
    },
  };
}

function declarations(isStandalone: boolean): RollupOptions {
  return {
    input: Object.fromEntries(
      entries.map((name) => [name, `build/esm/${name}.d.ts`]),
    ),
    output: {
      dir: isStandalone ? "build/bundle/standalone" : "build/bundle",
      entryFileNames: "[name].d.ts",
      chunkFileNames: "chunks/[name]-[hash].d.ts",
      format: "esm",
    },
    plugins: [
      ...(isStandalone ? [workspacePackages(true)] : []),
      dts({ respectExternal: true }),
      {
        name: "reflex-declaration-libraries",
        renderChunk(code) {
          // Lifecycle APIs expose Symbol.dispose; retain its built-in library
          // reference after declaration bundling for consumers targeting ES2022.
          return {
            code: `/// <reference lib="esnext.disposable" />\n${code}`,
            map: null,
          };
        },
      },
      ...(isStandalone ? [standalone()] : []),
    ],
    external: isStandalone ? [] : external,
    onwarn,
  };
}

export default [
  javascript(false),
  declarations(false),
  javascript(true),
  declarations(true),
];
