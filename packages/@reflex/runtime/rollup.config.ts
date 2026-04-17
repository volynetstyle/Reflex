import replace from "@rollup/plugin-replace";
import resolve from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import terser from "@rollup/plugin-terser";
import constEnum from "rollup-plugin-const-enum";
import type { Plugin, RollupOptions, OutputOptions } from "rollup";

type BuildFormat = "esm" | "cjs";

interface BuildTarget {
  readonly input: Record<string, string>;
  readonly name: string;
  readonly outDir: string;
  readonly format: BuildFormat;
  readonly isDev: boolean;
}

const INDEX_INPUT = { index: "build/esm/index.js" } as const;
const INDEX_AND_DEBUG_INPUT = {
  index: "build/esm/index.js",
  debug: "build/esm/debug.js",
} as const;

const EXTERNALS = ["vitest", "expect-type"]

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
  "isDisposedState",
  "isComputingState",
  "isScheduledState",
  "isSignalKind",
  "isEffectKind",
] as const;

// V8 generally prefers many small stable functions over one aggressively
// collapsed mega-function. Keep minification conservative and explicit.
const JIT_SAFE_COMPRESS = {
  defaults: false,
  booleans: true,
  comparisons: true,
  dead_code: true,
  drop_console: true,
  drop_debugger: true,
  evaluate: true,
  hoist_props: true,
  inline: 0,
  module: true,
  pure_getters: true,
  pure_funcs: [...PURE_FUNCS],
  reduce_funcs: false,
  reduce_vars: true,
  passes: 2,
  side_effects: true,
  toplevel: true,
  unused: true,
} as const;

const TREESHAKE_OPTIONS: RollupOptions["treeshake"] = {
  preset: "recommended",
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  tryCatchDeoptimization: false,
  correctVarValueBeforeDeclaration: false,
  unknownGlobalSideEffects: false,
};

const GENERATED_CODE_OPTIONS: NonNullable<OutputOptions["generatedCode"]> = {
  constBindings: true,
  arrowFunctions: true,
};

const TARGETS: readonly BuildTarget[] = [
  {
    input: INDEX_INPUT,
    name: "esm",
    outDir: "esm",
    format: "esm",
    isDev: false,
  },
  {
    input: INDEX_AND_DEBUG_INPUT,
    name: "esm-dev",
    outDir: "dev",
    format: "esm",
    isDev: true,
  },
  {
    input: INDEX_INPUT,
    name: "cjs",
    outDir: "cjs",
    format: "cjs",
    isDev: false,
  },
] as const;

function createLoggerPlugin(targetName: string): Plugin {
  return {
    name: "pipeline-logger",
    buildStart() {
      console.log(`\nstart build -> ${targetName}`);
    },
    generateBundle(_, bundle) {
      console.log(`bundle ${targetName} modules: ${Object.keys(bundle).length}`);
    },
    writeBundle(_, bundle) {
      const size = Object.values(bundle).reduce((total, chunk) => {
        return total + ("code" in chunk ? chunk.code.length : 0);
      }, 0);

      console.log(`bundle ${targetName} size ${(size / 1024).toFixed(2)} KB`);
      console.log(`done -> ${targetName}\n`);
    },
  };
}

function createSwcPlugin(isDev: boolean): Plugin | null {
  if (isDev) return null;

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

function createTerserPlugin(isDev: boolean): Plugin | null {
  if (isDev) return null;

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
    createLoggerPlugin(target.name),
    resolve({
      extensions: [".js"],
      exportConditions: ["import", "default"],
    }),
    replace({
      preventAssignment: true,
      values: {
        __DEV__: JSON.stringify(target.isDev),
      },
    }),
    constEnum(),
  ];

  const swcPlugin = createSwcPlugin(target.isDev);
  if (swcPlugin !== null) {
    plugins.push(swcPlugin);
  }

  const terserPlugin = createTerserPlugin(target.isDev);
  if (terserPlugin !== null) {
    plugins.push(terserPlugin);
  }

  return plugins;
}

function createOutput(target: BuildTarget): OutputOptions {
  return {
    dir: `dist/${target.outDir}`,
    format: target.format,
    entryFileNames: target.format === "cjs" ? "[name].cjs" : "[name].js",
    exports: target.format === "cjs" ? "named" : undefined,
    sourcemap: target.isDev,
    generatedCode: GENERATED_CODE_OPTIONS,
  };
}

function createConfig(target: BuildTarget): RollupOptions {
  return {
    input: target.input,
    output: createOutput(target),
    treeshake: TREESHAKE_OPTIONS,
    plugins: createPlugins(target),
    external: EXTERNALS,
  };
}

export default TARGETS.map(createConfig);
