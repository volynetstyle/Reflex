import type { RollupOptions, ModuleFormat, Plugin } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import constEnum from "rollup-plugin-const-enum";

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
    compress: {
      passes: 3,
      inline: 3,
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
      unsafe: true,
      evaluate: true,
    },
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
    constEnum(),
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
