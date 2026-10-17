import { selectRuntimeReplacements } from "../../tooling/configs/runtime-flags.ts";
import { resolve as resolvePath } from "node:path";
import type { GetManualChunk, Plugin, RollupOptions } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import {
  createBuildReporter,
  reportRollupWarning,
} from "../../scripts/rollup-build-reporter.ts";

type BuildFormat = "esm" | "cjs";

interface BuildTarget {
  name: string;
  outDir: string;
  format: BuildFormat;
  dev: boolean;
}

interface BuildEntry {
  input: string;
  outputPath: string;
}

const EXTERNALS = ["vitest", "expect-type"] as const;

const PURE_FUNCS = [
  "Object.freeze",
  "hasState",
  "isDirtyState",
  "isPendingState",
  "isChangedState",
  "isObsoleteState",
  "isTrackingState",
  "isVisitedState",
  "isComputingState",
  "isScheduledState",
  "isSignalKind",
  "isEffectKind",
] as const;

// Keep bundle transforms conservative for V8: avoid rewrites that collapse many
// small helpers into a few large polymorphic control-flow-heavy functions.
const JIT_SAFE_COMPRESS = {
  defaults: false,
  booleans: true,
  comparisons: true,
  dead_code: true,
  drop_console: true,
  drop_debugger: true,
  evaluate: true,
  hoist_props: true,
  inline: false,
  module: true,
  pure_getters: true,
  pure_funcs: [...PURE_FUNCS],
  reduce_funcs: false,
  reduce_vars: false,
  collapse_vars: false,
  passes: 2,
  side_effects: true,
  toplevel: true,
  unused: true,
};

const TARGETS: BuildTarget[] = [
  { name: "esm", outDir: "esm", format: "esm", dev: false },
  { name: "esm-dev", outDir: "dev", format: "esm", dev: true },
  { name: "cjs", outDir: "cjs", format: "cjs", dev: false },
];

const ENTRIES: ReadonlyArray<BuildEntry> = [
  {
    input: "build/esm/index.js",
    outputPath: "index",
  },
  {
    input: "build/esm/unstable/index.js",
    outputPath: "unstable/index",
  },
  {
    input: "build/esm/debug/index.js",
    outputPath: "debug/index",
  },
];

// Fold everything reachable from the root entry into index.[ext], so the
// runtime, scheduler and facade ship as one file and subpath entries import it
// instead of a shared hashed chunk.
function rootManualChunks(): GetManualChunk {
  const rootEntry = resolvePath(ENTRIES[0]!.input);
  let rootModules: Set<string> | undefined;

  return (id, { getModuleInfo }) => {
    if (rootModules === undefined) {
      rootModules = new Set();
      const pending = [rootEntry];

      while (pending.length > 0) {
        const current = pending.pop()!;
        if (rootModules.has(current)) continue;
        rootModules.add(current);
        pending.push(...(getModuleInfo(current)?.importedIds ?? []));
      }
    }

    return rootModules.has(id) ? ENTRIES[0]!.outputPath : undefined;
  };
}

function loggerPlugin(target: BuildTarget): Plugin {
  return createBuildReporter("@volynets/reflex", target.name);
}

function resolvePlugin(target: BuildTarget): Plugin {
  return resolve({
    extensions: [".js"],
    exportConditions: target.dev
      ? ["development", "import", "default"]
      : ["import", "default"],
  });
}

function replacePlugin(target: BuildTarget): Plugin {
  return replace({
    preventAssignment: true,
    values: selectRuntimeReplacements(target.dev ? "development" : "production", ["__DEV__", "__PROFILE__"]),
  });
}

function terserPlugin(target: BuildTarget): Plugin | undefined {
  if (target.dev) return undefined;

  return terser({
    compress: JIT_SAFE_COMPRESS,
    mangle: {
      toplevel: true,
      module: true,
      keep_classnames: true,
      properties: {
        regex: /^\$\$/,
        keep_quoted: true,
        reserved: ["payload", "compute", "meta", "runtime"],
      },
    },
    format: {
      comments: false,
    },
    ecma: 2020,
    module: true,
  });
}

function createPlugins(target: BuildTarget): Plugin[] {
  const plugins: Plugin[] = [
    loggerPlugin(target),
    resolvePlugin(target),
    replacePlugin(target),
  ];

  const minifier = terserPlugin(target);
  if (minifier !== undefined) plugins.push(minifier);

  return plugins;
}

function createConfig(target: BuildTarget): RollupOptions {
  const extension = target.format === "cjs" ? "cjs" : "js";

  return {
    // Build the entries together so root and unstable share runtime state and
    // live facade bindings instead of embedding independent reactive machines.
    input: Object.fromEntries(ENTRIES.map((entry) => [entry.outputPath, entry.input])),
    // Lets the root entry chunk carry the extra exports its subpaths import.
    preserveEntrySignatures: "allow-extension",
    logLevel: "silent",
    onwarn: reportRollupWarning,

    treeshake: {
      preset: "recommended",
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      correctVarValueBeforeDeclaration: false,
      unknownGlobalSideEffects: false,
    },

    output: {
      dir: `dist/${target.outDir}`,
      entryFileNames: `[name].${extension}`,
      chunkFileNames: `chunks/[name]-[hash].${extension}`,
      manualChunks: rootManualChunks(),
      format: target.format,
      exports: target.format === "cjs" ? "named" : undefined,
      sourcemap: target.dev,
      generatedCode: {
        constBindings: true,
        arrowFunctions: true,
      },
    },

    plugins: createPlugins(target),
    // The runtime is a peer: packages such as reflex-async, reflex-store and
    // reflex-dom import it directly and must observe the same active runtime
    // and graph. Inlining it here would give them a second kernel. The
    // scheduler keeps no shared state and is inlined with its declarations.
    external: (id) =>
      id === "@volynets/reflex-runtime" ||
      id.startsWith("@volynets/reflex-runtime/") ||
      EXTERNALS.some((external) => id === external),
  };
}

export default TARGETS.map(createConfig);
