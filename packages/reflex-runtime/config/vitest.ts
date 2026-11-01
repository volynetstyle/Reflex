// Vitest profiles of @volynets/reflex-runtime: one table instead of one config
// file per run. Every profile shares the package root, the source aliases, the
// node environment and the esbuild target; a profile states only what differs
// (compile-time flags, files, isolation, time limits). Select one with
// `vitest --config config/vitest.config.ts --mode <profile>`; without a mode
// (`test`, or `benchmark` for `vitest bench`) the profile is `source`.
import { resolve } from "node:path";
import type { UserConfig } from "vitest/config";
import {
  runtimeFlags,
  type RuntimeMode,
} from "../../../tooling/configs/runtime-flags.ts";
import {
  configRoot,
  sourceAliases,
} from "../../../tooling/configs/source-aliases.ts";
import { mutantPlugin } from "../testkit/lib/mutation.mjs";

const packageRoot = resolve(configRoot(import.meta.url), "..");

/**
 * Expose existing lexical walker state only in the source test transform. No
 * runtime fields, counters, callbacks or production exports are introduced.
 */
const walkerTestState = {
  name: "runtime-walker-test-state",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.replace(/\\/g, "/");
    if (
      normalizedId.endsWith("/src/kernel/stages/stabilization/pull_iterator.ts")
    )
      return (
        code + "\nexport { stack as testPullStack, high as testPullHigh };\n"
      );
    if (
      normalizedId.endsWith(
        "/src/kernel/stages/stabilization/pull_dependency.ts",
      )
    )
      return (
        code +
        "\nexport { testPullStack, testPullHigh } from './pull_iterator';\n"
      );
  },
};

const esbuild = { platform: "node", format: "esm", treeShaking: true } as const;

interface Profile {
  /** Compile-time flags (tooling/configs/runtime-flags.ts). */
  flags: RuntimeMode;
  test: NonNullable<UserConfig["test"]>;
  /** `pnpm rt audit` mutation plugin: on for every gating suite. */
  mutable?: boolean;
  plugins?: UserConfig["plugins"];
  aliases?: UserConfig["resolve"];
  /** The projection profile keeps vite's default build and esbuild options. */
  bare?: boolean;
}

const sourceTest: NonNullable<UserConfig["test"]> = {
  name: "runtime/source",
  environment: "node",
  exclude: [
    "**/node_modules/**",
    "test/dev/**/*.dev.test.ts",
    "test/projection/**/*.test.ts",
    // Pinned behavior outside the contract: profile `characterization`.
    "test/characterization/**",
  ],
  isolate: false,
  pool: "forks",
  coverage: {
    reporter: ["text", "lcov"],
    include: ["src/**/*.ts"],
    exclude: [
      "src/**/*.d.ts",
      "src/**/index.ts",
      "src/subtle.ts",
      "debug/**",
      "debug/debug.types.ts",
      "debug/dev_flag.ts",
      "src/internal/process.ts",
      "src/kernel/dev.ts",
      "src/kernel/reduction/types.ts",
      "src/kernel/stages/**",
      "src/kernel/static/types.ts",
      "src/reactivity/dev.ts",
    ],
    thresholds: { statements: 84, functions: 80, lines: 85 },
  },
};

/** A research sweep: one file, its own time limit, shared module graph. */
const sweep = (
  name: string,
  file: string,
  testTimeout: number,
): NonNullable<UserConfig["test"]> => ({
  name: `runtime/${name}`,
  environment: "node",
  include: [file],
  isolate: false,
  pool: "forks",
  testTimeout,
});

export const PROFILES = {
  source: {
    flags: "source-test",
    mutable: true,
    plugins: [walkerTestState],
    test: sourceTest,
  },
  dev: {
    flags: "dev-test",
    mutable: true,
    test: {
      name: "runtime/dev",
      environment: "node",
      include: ["test/dev/**/*.dev.test.ts"],
      isolate: false,
      pool: "forks",
    },
  },
  projection: {
    flags: "dev-test",
    mutable: true,
    bare: true,
    test: {
      name: "runtime/projection",
      include: ["test/projection/**/*.test.ts"],
      environment: "node",
      isolate: true,
      pool: "forks",
    },
  },
  // Regions the contract leaves open (F1, watcher disposal from a host hook):
  // pins of today's behavior, reported as `changed` by the testkit, never a
  // correctness verdict (layer `characterization`).
  characterization: {
    flags: "source-test",
    mutable: true,
    plugins: [walkerTestState],
    test: {
      ...sourceTest,
      name: "runtime/characterization",
      include: ["test/characterization/**/*.test.ts"],
      exclude: ["**/node_modules/**"],
    },
  },
  // Structural leg of the cost-attribution sweep: __PROFILE__ on, so
  // profileRuntime() captures real counters and topology.
  "cost-attribution-structural": {
    flags: "profile-test",
    test: sweep(
      "cost-attribution-structural",
      "test/perf/cost-attribution/structural.sweep.ts",
      120_000,
    ),
  },
  // Timing leg: a real non-profile build, so profileRuntimeCounter's guard is
  // compiled out of every hot-path call site rather than merely skipped.
  "cost-attribution-timing": {
    flags: "source-test",
    test: sweep(
      "cost-attribution-timing",
      "test/perf/cost-attribution/timing.sweep.ts",
      300_000,
    ),
  },
  "work-amplification": {
    flags: "profile-test",
    test: sweep(
      "work-amplification",
      "test/perf/work-amplification/amplification.sweep.ts",
      120_000,
    ),
  },
  // The managed leg imports reflex-framework ownership from source, so every
  // runtime entry resolves to the modules the harness imports directly;
  // --expose-gc for retention and heap measurements.
  "lifetime-churn": {
    flags: "profile-test",
    aliases: {
      alias: [
        ...sourceAliases("framework"),
        {
          find: "@volynets/reflex-framework",
          replacement: resolve(packageRoot, "../reflex-framework/src/index.ts"),
        },
      ],
    },
    test: {
      ...sweep(
        "lifetime-churn",
        "test/perf/lifetime-churn/lifetime-churn.sweep.ts",
        1_800_000,
      ),
      execArgv: ["--expose-gc"],
    },
  },
} satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;

/** The vite/vitest configuration of one profile. */
export function vitestProfile(name: string): UserConfig {
  const profile: Profile | undefined = PROFILES[name as ProfileName];
  if (profile === undefined)
    throw new Error(
      `unknown vitest profile "${name}" (known: ${Object.keys(PROFILES).join(", ")})`,
    );
  const plugins = [
    ...(profile.mutable ? [mutantPlugin()] : []),
    ...(profile.plugins ?? []),
  ];
  return {
    root: packageRoot,
    ...(plugins.length > 0 ? { plugins } : {}),
    resolve: profile.aliases ?? { alias: sourceAliases("runtime") },
    define: runtimeFlags(profile.flags),
    ...(profile.bare ? {} : { build: { lib: false } }),
    test: profile.test,
    ...(profile.bare ? {} : { esbuild }),
  };
}

/** The profile a vite mode selects. */
export const profileOfMode = (mode: string): string =>
  mode === "test" || mode === "benchmark" ? "source" : mode;
