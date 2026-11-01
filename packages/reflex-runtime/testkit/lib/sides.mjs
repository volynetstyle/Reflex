// Sides of a comparison: which runtime build a command runs a program on.
//
//   side      := base ("+" modifier)*
//   base      := "source"            the working tree
//              | "baseline"          the oracle's pinned commit (testkit/oracle/baseline-commit.txt)
//              | <git ref>           any commit, branch or tag (HEAD, HEAD^, main, 4efa8cc)
//              | "bundle:" <path>    a prebuilt runtime.mjs, loaded as is
//   modifier  := <variant>           a research variant of perf/tracking-ladder/variants.mjs
//              | "mutant:" <id>      a seeded mutant of testkit/oracle/mutants.ts
//
// Every built side goes through scripts/build-baseline-oracle.mjs, so all
// sides of one run share a toolchain and differ only in sources. The flavor
// picks the build:
//
//   oracle      test flags, unminified (as the vitest oracle suites)
//   production  production flags, constants inlined, Terser (as dist and the
//               paired benchmarks)
//   readable    production without mangling (CPU profiles, shape diffs)
//   profile     oracle plus setRuntimeProjectionObserver (branch coverage)
//
// Commit sides are immutable and cached by resolved SHA; working-tree sides
// are rebuilt on every run so they never go stale.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { UsageError } from "./args.mjs";
import {
  oracleBuilder,
  packageRoot,
  pinnedBaseline,
  repoRoot,
  sidesDir,
} from "./paths.mjs";

export const FLAVORS = ["oracle", "production", "readable", "profile"];

const flavorFlags = {
  oracle: [],
  production: ["--production"],
  readable: ["--production", "--readable"],
  profile: ["--profile"],
};

/** Parses a side spec without touching git or the file system. */
export function parseSide(spec) {
  if (typeof spec !== "string" || spec.trim() === "")
    throw new UsageError("empty side");
  if (spec.startsWith("bundle:")) {
    const file = spec.slice("bundle:".length);
    if (file === "") throw new UsageError(`side "${spec}" names no bundle`);
    return { spec, kind: "bundle", file, variants: [], mutants: [] };
  }
  const [base, ...modifiers] = spec.split("+");
  if (base === "") throw new UsageError(`side "${spec}" has no base`);
  const variants = [];
  const mutants = [];
  for (const modifier of modifiers) {
    if (modifier.startsWith("mutant:")) mutants.push(modifier.slice(7));
    else if (modifier !== "") variants.push(modifier);
    else throw new UsageError(`side "${spec}" has an empty modifier`);
  }
  const kind =
    base === "source" ? "source" : base === "baseline" ? "baseline" : "ref";
  return { spec, kind, ref: base, variants, mutants };
}

/** Replay immutable sides at the recorded commit, even after their ref moves. */
export function recordedSideSpec(side) {
  if (side === undefined) return undefined;
  if (
    /^[0-9a-f]{40}$/.test(side.commit ?? "") &&
    !side.spec.startsWith("bundle:")
  )
    return [side.commit, ...side.spec.split("+").slice(1)].join("+");
  return side.spec;
}

function revParse(ref) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // The pinned baseline may be missing from a shallow clone; the builder
    // fetches a full SHA itself.
    if (/^[0-9a-f]{40}$/.test(ref)) return ref;
    throw new UsageError(`unknown git ref "${ref}"`);
  }
}

async function mutationsOf(parsed) {
  const mutations = [];
  if (parsed.variants.length > 0) {
    const { variants } = await import(
      pathToFileURL(path.join(packageRoot, "perf/tracking-ladder/variants.mjs"))
        .href
    );
    for (const name of parsed.variants) {
      if (variants[name] === undefined)
        throw new UsageError(
          `unknown variant "${name}" (known: ${Object.keys(variants).join(", ")})`,
        );
      mutations.push(...variants[name]);
    }
  }
  if (parsed.mutants.length > 0) {
    const { MUTANTS, mutationArgument } = await import(
      pathToFileURL(path.join(packageRoot, "testkit/oracle/mutants.ts")).href
    );
    for (const id of parsed.mutants) {
      const mutant = MUTANTS.find((item) => item.id === id);
      if (mutant === undefined)
        throw new UsageError(
          `unknown mutant "${id}" (known: ${MUTANTS.map((m) => m.id).join(", ")})`,
        );
      mutations.push(mutationArgument(mutant));
    }
  }
  return mutations;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Content hash of a bundle. Unminified builds carry esbuild's module path
 * comments, which name the builder's temporary directory; the hash ignores
 * that directory, so two builds of the same sources hash the same.
 */
export function bundleHash(code) {
  return sha256(
    code
      .toString("utf8")
      .replace(/^\/\/ .*?reflex-oracle-[^/\\]+[/\\]pkg[/\\]/gm, "// "),
  );
}

// One build per side and flavor per process: both sides of an A/A control
// are the same file, loaded as two module instances.
const built = new Map();
const ownBuilds = new Set();
process.once("exit", () => {
  for (const dir of ownBuilds) rmSync(dir, { recursive: true, force: true });
});

/**
 * Builds (or reuses) a side and returns its description:
 * `{ spec, flavor, commit, file, bundleSha256, mutations }`.
 * `extraMutations` are `--mutate` arguments applied after the side's own.
 */
export async function buildSide(
  spec,
  { flavor = "oracle", extraMutations = [], quiet = false } = {},
) {
  if (!FLAVORS.includes(flavor))
    throw new UsageError(
      `unknown flavor "${flavor}" (known: ${FLAVORS.join(", ")})`,
    );
  const parsed = parseSide(spec);
  if (parsed.kind === "bundle") {
    const file = path.resolve(parsed.file);
    if (!existsSync(file)) throw new UsageError(`no bundle at ${file}`);
    return {
      spec,
      flavor: "prebuilt",
      commit: null,
      file,
      bundleSha256: bundleHash(readFileSync(file)),
      mutations: [],
    };
  }
  const commit =
    parsed.kind === "source"
      ? "working-tree"
      : revParse(parsed.kind === "baseline" ? pinnedBaseline() : parsed.ref);
  const mutations = [...(await mutationsOf(parsed)), ...extraMutations];
  const key = [
    commit === "working-tree" ? "source" : commit.slice(0, 12),
    flavor,
    mutations.length === 0
      ? null
      : sha256(JSON.stringify(mutations)).slice(0, 10),
  ]
    .filter(Boolean)
    .join("-");
  if (built.has(key)) return { ...built.get(key), spec };
  // A working-tree build belongs to this process: concurrent runs never
  // replace each other's bundle, and the directory goes when the process does.
  const out = path.join(
    sidesDir,
    commit === "working-tree" ? `${key}-${process.pid}` : key,
  );
  const file = path.join(out, "runtime.mjs");
  if (commit === "working-tree") ownBuilds.add(out);
  if (commit === "working-tree" || !existsSync(file)) {
    if (!quiet) process.stderr.write(`testkit: building ${spec} (${flavor})\n`);
    try {
      execFileSync(
        process.execPath,
        [
          oracleBuilder,
          ...(commit === "working-tree" ? ["--source"] : ["--commit", commit]),
          ...flavorFlags[flavor],
          ...mutations.flatMap((mutation) => ["--mutate", mutation]),
          "--out",
          out,
        ],
        { cwd: packageRoot, stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (error) {
      throw new Error(
        `cannot build side "${spec}" (${flavor}):\n${error.stderr?.toString() ?? error.message}`,
      );
    }
  }
  const side = {
    spec,
    flavor,
    commit,
    file,
    bundleSha256: bundleHash(readFileSync(file)),
    mutations,
  };
  built.set(key, side);
  return side;
}

/** Imports a built side. A fresh URL per call, so rebuilt sides reload. */
export async function loadSide(side) {
  const url = `${pathToFileURL(side.file).href}?t=${Date.now()}-${Math.random()}`;
  return import(url);
}

let head;
/** HEAD and whether the package sources differ from it. */
function workingTreeBase() {
  if (head === undefined) {
    const git = (args) =>
      execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
    head = {
      head: git(["rev-parse", "HEAD"]),
      dirty:
        git([
          "status",
          "--porcelain",
          "--",
          "packages/reflex-runtime/src",
          "packages/reflex-runtime/debug",
        ]) !== "",
    };
  }
  return head;
}

/** The JSON-safe record of a side kept in reports and counterexamples. */
export const describeSide = ({ spec, flavor, commit, bundleSha256 }) => ({
  spec,
  flavor,
  commit,
  ...(commit === "working-tree" ? workingTreeBase() : {}),
  bundleSha256,
});
