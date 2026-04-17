import type { RollupOptions, ModuleFormat, Plugin } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";

type BuildFormat = "esm" | "cjs";

interface BuildTarget {
  name: string;
  outDir: string;
  format: BuildFormat;
  dev: boolean;
}

interface BuildContext {
  target: BuildTarget;
}

// Keep compression explicit and conservative so V8 sees stable function
// boundaries instead of a few giant inlined CFG-heavy functions.
const JIT_SAFE_COMPRESS = {
  defaults: false,
  booleans: true,
  comparisons: true,
  dead_code: true,
  drop_console: true,
  drop_debugger: true,
  evaluate: true,
  pure_getters: true,
  side_effects: true,
  toplevel: true,
  unused: true,
} as const;

function loggerStage(ctx: BuildContext): Plugin {
  const name = ctx.target.name;

  return {
    name: "pipeline-logger",

    buildStart() {
      console.log(`\n🚀 start build → ${name}`);
    },

    generateBundle(_, bundle) {
      const modules = Object.keys(bundle).length;
      console.log(`📦 ${name} modules: ${modules}`);
    },

    writeBundle(_, bundle) {
      const size = Object.values(bundle)
        .map((b: any) => b.code?.length ?? 0)
        .reduce((a, b) => a + b, 0);

      console.log(`📊 ${name} size ${(size / 1024).toFixed(2)} KB`);
      console.log(`✔ done → ${name}\n`);
    },
  };
}

function resolverStage(): Plugin {
  return resolve({
    extensions: [".js"],
    exportConditions: ["import", "default"],
  });
}

function replaceStage(ctx: BuildContext): Plugin {
  return replace({
    preventAssignment: true,
    values: {
      __DEV__: JSON.stringify(ctx.target.dev),
    },
  });
}

function minifyStage(ctx: BuildContext): Plugin | null {
  if (ctx.target.dev) return null;

  return terser({
    compress: JIT_SAFE_COMPRESS,
    mangle: {
      toplevel: true,
      keep_classnames: true,
    },
    format: {
      comments: false,
    },
  });
}

function pipeline(ctx: BuildContext): Plugin[] {
  const stages = [
    loggerStage(ctx),
    resolverStage(),
    replaceStage(ctx),
    minifyStage(ctx),
  ];

  return stages.filter(Boolean) as Plugin[];
}

function createConfig(target: BuildTarget): RollupOptions {
  const ctx: BuildContext = { target };

  return {
    input: {
      index: "build/esm/index.js",
    },

    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      correctVarValueBeforeDeclaration: false,
    },
    output: {
      dir: `dist/${target.outDir}`,
      format: target.format,

      entryFileNames: "[name].js",

      exports: target.format === "cjs" ? "named" : undefined,
      sourcemap: target.dev,

      generatedCode: {
        constBindings: true,
        arrowFunctions: true,
      },
    },

    plugins: pipeline(ctx),

    external: ["vitest", "expect-type"],
  };
}

const targets: BuildTarget[] = [
  {
    name: "esm",
    outDir: "esm",
    format: "esm",
    dev: false,
  },
  {
    name: "esm-dev",
    outDir: "dev",
    format: "esm",
    dev: true,
  },
  {
    name: "cjs",
    outDir: "cjs",
    format: "cjs",
    dev: false,
  },
];

export default targets.map(createConfig);
