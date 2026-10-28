// Source mutation for the vitest suites (`pnpm rt audit`). The oracle bundle
// builder applies a mutant to a bundle (scripts/build-baseline-oracle.mjs
// --mutate); the vitest suites import `src` through vite instead, so the
// audit applies the same mutant in a vite transform. Without
// REFLEX_MUTATIONS the plugin does nothing, so the test configs that load
// it are unchanged in every other run.
//
//   REFLEX_MUTATIONS    JSON [{ file, search, replace }], file relative to the package
//   REFLEX_REACH_FILE   JSON lines { file, hits } per test file (reach probe)
import path from "node:path";

/** Statement that counts executions of the mutated site. */
export const PROBE =
  "globalThis.__reflexReach = (globalThis.__reflexReach | 0) + 1;";
/** Marker in a replacement where the probe goes, when a prefix is unsafe. */
export const REACH_MARKER = "/*REACH*/";

/**
 * Whether a statement may be inserted right before `index`: the preceding
 * code, comments skipped, ends a statement or opens or closes a block. A
 * braceless `if (...)` body is not such a position; neither is the start of
 * an `else`, `catch` or `finally` (checked by `instrument`).
 */
export function statementBoundary(code, index) {
  let before = code.slice(0, index);
  for (;;) {
    const trimmed = before.trimEnd();
    if (trimmed.endsWith("*/")) {
      before = trimmed.slice(0, trimmed.lastIndexOf("/*"));
      continue;
    }
    const lineStart = trimmed.lastIndexOf("\n") + 1;
    const line = trimmed.slice(lineStart).trimStart();
    if (line.startsWith("//")) {
      before = trimmed.slice(0, lineStart);
      continue;
    }
    if (trimmed === "") return true;
    return ";{}".includes(trimmed.at(-1));
  }
}

/**
 * Applies `mutation` to the first occurrence of its search text, as the
 * oracle bundle builder does, so one mutant is one program in both places.
 * Returns { code, probed, occurrences }: `probed` is false when neither the
 * marker nor a safe prefix position exists, so reach is not measured.
 */
export function instrument(
  code,
  { file, search, replace },
  { probe = true } = {},
) {
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const find = search.replace(/\r?\n/g, eol);
  let substitute = replace.replace(/\r?\n/g, eol);
  const at = code.indexOf(find);
  if (at === -1) throw new Error(`mutation search text not found in ${file}`);
  let occurrences = 0;
  for (let i = at; i !== -1; i = code.indexOf(find, i + 1)) occurrences++;
  let probed = false;
  if (probe && substitute.includes(REACH_MARKER)) {
    substitute = substitute.replace(REACH_MARKER, PROBE);
    probed = true;
  } else if (
    probe &&
    statementBoundary(code, at) &&
    !/^\s*(else|catch|finally)\b/.test(find)
  ) {
    substitute = PROBE + " " + substitute;
    probed = true;
  }
  return {
    code: code.slice(0, at) + substitute + code.slice(at + find.length),
    probed,
    occurrences,
  };
}

const reachSetup = path.join(import.meta.dirname, "reach-setup.mjs");

/** The vite plugin of the mutated vitest run; a no-op without REFLEX_MUTATIONS. */
export function mutantPlugin() {
  const raw = process.env.REFLEX_MUTATIONS;
  const mutations = raw ? JSON.parse(raw) : [];
  if (mutations.length === 0) return { name: "reflex-testkit-mutant" };
  return {
    name: "reflex-testkit-mutant",
    enforce: "pre",
    config() {
      if (process.env.REFLEX_REACH_FILE)
        return { test: { setupFiles: [reachSetup] } };
    },
    transform(code, id) {
      const file = id.split("?")[0].replace(/\\/g, "/");
      let result = code;
      let changed = false;
      for (const mutation of mutations) {
        if (!file.endsWith(`/${mutation.file}`)) continue;
        result = instrument(result, mutation).code;
        changed = true;
      }
      return changed ? result : undefined;
    },
  };
}
