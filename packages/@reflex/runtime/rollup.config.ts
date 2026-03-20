import type { RollupOptions, ModuleFormat, Plugin } from "rollup";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import constEnum from "rollup-plugin-const-enum";
import swc from "@rollup/plugin-swc";

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
      console.log(`📦 ${name} modules: ${Object.keys(bundle).length}`);
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

/**
 * SWC делает первый проход инлайнинга до того, как Rollup
 * свяжет модули. Это позволяет раскрыть простые обёртки
 * вроде `function h(n) { return s(n, 3) }` ещё на уровне AST,
 * до того как terser увидит связанный bundle.
 */
function swcStage(ctx: BuildContext): Plugin {
  if (ctx.target.dev) return null as any;

  return swc({
    swc: {
      jsc: {
        target: "es2022",
        parser: { syntax: "ecmascript" },
        transform: {
          optimizer: {
            simplify: true,
            // Инлайним константы и чистые функции-обёртки
            globals: {
              vars: {
                __DEV__: JSON.stringify(ctx.target.dev),
              },
            },
          },
        },
        minify: {
          // Первый лёгкий проход — только инлайн и свёртка констант,
          // без переименований (terser сделает это позже агрессивнее)
          compress: {
            inline: 3,
            reduce_vars: true,
            reduce_funcs: true,
            collapse_vars: true,
            pure_getters: true,
            // Не трогаем имена — оставим terser
            unused: false,
          },
          mangle: false,
        },
      },
      module: { type: "es6" },
    },
  });
}

function minifyStage(ctx: BuildContext): Plugin | null {
  if (ctx.target.dev) return null;

  return terser({
    compress: {
      passes: 5, // +1 проход для раскрытия цепочек после SWC
      inline: 3, // 3 = инлайн функций с аргументами
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
      unsafe: true,
      unsafe_arrows: true,
      unsafe_methods: true,
      unsafe_math: true,
      unsafe_comps: true,
      evaluate: true,

      // Критично для инлайна однострочников: разрешаем
      // terser считать вызовы чистых функций побочно-эффектными
      pure_funcs: [
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
        "isDirtyState",
        "isPendingState",
        "isChangedState",
        "isObsoleteState",
        "isDisposedState",
        "isComputingState",
        "isScheduledState",
        "isSignalKind",
        "isEffectKind",
      ],
      toplevel: true, // обязательно для инлайна модульных функций
      module: true, // ESM: нет неявных глобальных замыканий
    },

    mangle: {
      toplevel: true,
      module: true, // важно: без этого toplevel mangle не работает в ESM
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

    // Говорим terser, что ESM модуль — строгий режим,
    // нет утечки в глобальный скоп
    ecma: 2020,
    module: true,
  });
}

function pipeline(ctx: BuildContext): Plugin[] {
  return [
    loggerStage(ctx),
    resolverStage(),
    replaceStage(ctx),
    swcStage(ctx), // пре-инлайн до Rollup bundle phase
    minifyStage(ctx),
    constEnum(),
  ].filter(Boolean) as Plugin[];
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
      unknownGlobalSideEffects: false,
      // Добавляем: Rollup сам попробует раскрыть
      // pure-функции при tree-shaking
      preset: "recommended",
    },

    output: {
      dir: `dist/${target.outDir}`,
      format: target.format,
      inlineDynamicImports: true,
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
  { name: "esm", outDir: "esm", format: "esm", dev: false },
  { name: "esm-dev", outDir: "dev", format: "esm", dev: true },
  { name: "cjs", outDir: "cjs", format: "cjs", dev: false },
];

export default targets.map(createConfig);
