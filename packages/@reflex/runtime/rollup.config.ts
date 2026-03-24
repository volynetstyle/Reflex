import type { Plugin, RollupOptions } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import constEnum from "rollup-plugin-const-enum";

type BuildFormat = "esm" | "cjs";

interface BuildTarget {
  name: string;
  outDir: string;
  format: BuildFormat;
  dev: boolean;
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
  "isDisposedState",
  "isComputingState",
  "isScheduledState",
  "isSignalKind",
  "isEffectKind",
] as const;

const TARGETS: BuildTarget[] = [
  { name: "esm", outDir: "esm", format: "esm", dev: false },
  { name: "esm-dev", outDir: "dev", format: "esm", dev: true },
  { name: "cjs", outDir: "cjs", format: "cjs", dev: false },
];

function compactPlugins(plugins: Array<Plugin | undefined | false>): Plugin[] {
  return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
}

function loggerPlugin(target: BuildTarget): Plugin {
  const { name } = target;

  return {
    name: "pipeline-logger",
    buildStart() {
      console.log(`\n🚀 start build → ${name}`);
    },
    generateBundle(_, bundle) {
      console.log(`📦 ${name} modules: ${Object.keys(bundle).length}`);
    },
    writeBundle(_, bundle) {
      const size = Object.values(bundle).reduce((total, chunk) => {
        return total + ("code" in chunk ? chunk.code.length : 0);
      }, 0);

      console.log(`📊 ${name} size ${(size / 1024).toFixed(2)} KB`);
      console.log(`✔ done → ${name}\n`);
    },
  };
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
        transform: {
          optimizer: {
            simplify: true,
            globals: {
              vars: {
                __DEV__: JSON.stringify(target.dev),
              },
            },
          },
        },
      },
      module: { type: "es6" },
    },
  });
}
function terserPlugin(target: BuildTarget): Plugin | undefined {
  if (target.dev) return undefined;

  return terser({
    compress: {
      passes: 4,
      inline: 3,
      hoist_props: true,
      collapse_vars: true,
      dead_code: true,
      drop_console: true,
      drop_debugger: true,
      reduce_vars: true,
      reduce_funcs: true,
      conditionals: true,
      comparisons: true,
      booleans: true,
      unused: true,
      if_return: true,
      sequences: true,
      pure_getters: true,
      evaluate: true,
      pure_funcs: [...PURE_FUNCS],
      toplevel: true,
      module: true,

      // Осторожно: unsafe-флаги полезны не всегда.
      unsafe: true,
      unsafe_arrows: true,
      unsafe_methods: true,
      unsafe_math: true,
      unsafe_comps: true,
    },
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
  return compactPlugins([
    loggerPlugin(target),
    resolvePlugin(),
    replacePlugin(target),
    swcPlugin(target),
    terserPlugin(target),
    constEnum(),
  ]);
}

function createConfig(target: BuildTarget): RollupOptions {
  return {
    input: {
      index: "build/esm/index.js",
    },

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
      format: target.format,
      inlineDynamicImports: true,
      entryFileNames: target.format === "cjs" ? "[name].cjs" : "[name].js",
      exports: target.format === "cjs" ? "named" : undefined,
      sourcemap: target.dev,
      generatedCode: {
        constBindings: true,
        arrowFunctions: true,
      },
    },

    plugins: createPlugins(target),
    external: [...EXTERNALS],
  };
}

export default TARGETS.map(createConfig);
