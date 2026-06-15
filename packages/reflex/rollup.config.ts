import type { Plugin, RollupOptions } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import constEnum from "rollup-plugin-const-enum";
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
  "Object.defineProperty",
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
  inline: 1,
  module: true,
  pure_getters: true,
  pure_funcs: [...PURE_FUNCS],
  reduce_funcs: false,
  reduce_vars: true,
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
  // {
  //   input: "build/esm/unstable/index.js",
  //   outputPath: "unstable/index",
  // },
  {
    input: "build/esm/debug/index.js",
    outputPath: "debug/index",
  },
];

function compactPlugins(plugins: Array<Plugin | undefined | false>): Plugin[] {
  return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
}

function loggerPlugin(target: BuildTarget, entry: BuildEntry): Plugin {
  const name = `${target.name}:${entry.outputPath}`;
  return createBuildReporter("@volynets/reflex", name);
}

function resolvePlugin(): Plugin {
  return resolve({
    extensions: [".js"],
    exportConditions: ["import", "default"],
  });
}

function replacePlugin(target: BuildTarget): Plugin {
  return replace({
    preventAssignment: true,
    values: {
      __DEV__: JSON.stringify(target.dev),
      __PROFILE__: JSON.stringify(target.dev),
    },
  });
}

function swcPlugin(target: BuildTarget): Plugin | undefined {
  if (target.dev) return undefined;

  return swc({
    swc: {
      jsc: {
        target: "es2022",
        parser: { syntax: "ecmascript" },
      },
      module: { type: "es6" },
    },
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

function createPlugins(target: BuildTarget, entry: BuildEntry): Plugin[] {
  return compactPlugins([
    loggerPlugin(target, entry),
    resolvePlugin(),
    replacePlugin(target),
    constEnum(),
    swcPlugin(target),
    terserPlugin(target),
  ]);
}

function createConfig(target: BuildTarget, entry: BuildEntry): RollupOptions {
  const extension = target.format === "cjs" ? "cjs" : "js";

  return {
    input: entry.input,
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
      file: `dist/${target.outDir}/${entry.outputPath}.${extension}`,
      format: target.format,
      exports: target.format === "cjs" ? "named" : undefined,
      sourcemap: target.dev,
      generatedCode: {
        constBindings: true,
        arrowFunctions: true,
      },
    },

    plugins: createPlugins(target, entry),
    external: [...EXTERNALS],
  };
}

export default TARGETS.flatMap((target) =>
  ENTRIES.map((entry) => createConfig(target, entry)),
);
