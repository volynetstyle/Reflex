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
    preferBuiltins: true,
  });
}

function constEnumStage(): Plugin {
  return constEnum({
    files: ["src/core.ts", "src/api.ts"],
  });
}

function stripInternalEnumRuntimeStage(): Plugin {
  const enumBlocks = [
    /var ReactiveNodeState,ReactiveNodeKind,ComputedMode;!function\(ReactiveNodeState\)\{[\s\S]*?\}\(ReactiveNodeKind\|\|\(ReactiveNodeKind=\{\}\)\);/g,
    /var ReactiveNodeState,ReactiveNodeKind;!function\(ReactiveNodeState\)\{[\s\S]*?\}\(ReactiveNodeKind\|\|\(ReactiveNodeKind=\{\}\)\);/g,
    /var ReactiveNodeState, ReactiveNodeKind, ComputedMode;\s*\(function \(ReactiveNodeState\) \{[\s\S]*?\}\)\(ReactiveNodeKind \|\| \(ReactiveNodeKind = \{\}\)\);\s*/g,
    /var ReactiveNodeState, ReactiveNodeKind;\s*\(function \(ReactiveNodeState\) \{[\s\S]*?\}\)\(ReactiveNodeKind \|\| \(ReactiveNodeKind = \{\}\)\);\s*/g,
  ];

  return {
    name: "strip-internal-enum-runtime",

    renderChunk(code) {
      let nextCode = code;
      for (const block of enumBlocks) {
        nextCode = nextCode.replace(block, (match) =>
          match.includes("ComputedMode") ? "var ComputedMode;" : "",
        );
      }

      if (nextCode === code) return null;

      return {
        code: nextCode,
        map: null,
      };
    },
  };
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

  const isEsm = ctx.target.format === "esm";

  return terser({
    ecma: 2020,
    module: isEsm,
    keep_classnames: true,
    keep_fnames: true,
    compress: {
      ecma: 2020,
      module: isEsm,
      toplevel: true,
      // Push function inlining hard, but stay within Terser's safe transforms.
      passes: 4,
      inline: 3,
      collapse_vars: true,
      reduce_funcs: true,
      reduce_vars: true,
      dead_code: true,
      drop_console: true,
      drop_debugger: true,
      conditionals: true,
      comparisons: true,
      booleans: true,
      unused: true,
      if_return: true,
      join_vars: true,
      hoist_props: true,
      sequences: true,
      side_effects: true,
      switches: true,
      typeofs: true,
      pure_getters: "strict",
      evaluate: true,
      defaults: true,
    },
    mangle: false,
    format: {
      comments: false,
      ecma: 2020,
    },
  });
}

function pipeline(ctx: BuildContext): Plugin[] {
  const stages = [
    loggerStage(ctx),
    constEnumStage(),
    resolverStage(),
    replaceStage(ctx),
    minifyStage(ctx),
    stripInternalEnumRuntimeStage(),
  ];

  return stages.filter(Boolean) as Plugin[];
}

function createConfig(target: BuildTarget): RollupOptions {
  const ctx: BuildContext = { target };

  return {
    input: {
      index: "build/esm/index.js",
    },
    preserveEntrySignatures: "exports-only",

    treeshake: {
      preset: "recommended",
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      correctVarValueBeforeDeclaration: false,
      unknownGlobalSideEffects: false,
      annotations: true,
    },
    output: {
      dir: `dist/${target.outDir}`,
      format: target.format,

      entryFileNames: "[name].js",

      exports: target.format === "cjs" ? "named" : undefined,
      sourcemap: target.dev,
      interop: "auto",
      freeze: false,
      esModule: target.format === "cjs",

      generatedCode: {
        constBindings: true,
        arrowFunctions: true,
        objectShorthand: true,
        symbols: true,
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
