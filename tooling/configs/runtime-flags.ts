/** Compile-time modes. Source tests deliberately keep __PROD__ false. */
export const runtimeFlagNames = [
  "__DEV__", "__PROFILE__", "__TRACKING_ONE_HOP__", "__TRACKING_TWO_HOP__",
  "__TRACKING_LAST_EDGE__", "__TEST__", "__PROD__",
] as const;

export type RuntimeFlagName = (typeof runtimeFlagNames)[number];
export type RuntimeFlags = Record<RuntimeFlagName, boolean>;
export type RuntimeMode = "source-test" | "dev-test" | "profile-test" | "production" | "development";

const sourceFlags: RuntimeFlags = {
  __DEV__: false,
  __PROFILE__: false,
  __TRACKING_ONE_HOP__: true,
  __TRACKING_TWO_HOP__: true,
  __TRACKING_LAST_EDGE__: true,
  __TEST__: true,
  __PROD__: false,
};

const modes: Record<RuntimeMode, RuntimeFlags> = {
  "source-test": sourceFlags,
  "dev-test": { ...sourceFlags, __DEV__: true, __PROFILE__: true },
  "profile-test": { ...sourceFlags, __PROFILE__: true },
  production: { ...sourceFlags, __TEST__: false, __PROD__: true },
  development: { ...sourceFlags, __DEV__: true, __PROFILE__: true, __TEST__: false },
};

export function runtimeFlags(mode: RuntimeMode, overrides: Partial<RuntimeFlags> = {}): RuntimeFlags {
  const result = { ...modes[mode], ...overrides };
  for (const name of runtimeFlagNames) {
    if (typeof result[name] !== "boolean") throw new TypeError("Invalid runtime flag: " + name);
  }
  return result;
}

/** Rollup replace values stay literal text; callers retain their guard options. */
export function runtimeReplacements(mode: RuntimeMode, overrides: Partial<RuntimeFlags> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries(runtimeFlags(mode, overrides)).map(([name, value]) => [name, String(value)]));
}

/** Existing application configs intentionally define only these three flags. */
export function applicationFlags() {
  return { __DEV__: true, __TEST__: false, __PROD__: false };
}

/** Retain legacy replacement surfaces while sharing each value definition. */
export function selectRuntimeReplacements(mode: RuntimeMode, names: readonly RuntimeFlagName[], overrides: Partial<RuntimeFlags> = {}): Record<string, string> {
  const values = runtimeFlags(mode, overrides);
  return Object.fromEntries(names.map((name) => [name, String(values[name])]));
}
