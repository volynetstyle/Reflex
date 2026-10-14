// Builds a frozen, self-contained runtime bundle from a fixed commit for
// differential testing (test/oracle). The bundle resolves every internal
// import to the archived baseline sources, so it shares no code with the
// implementation under test.
//
//   node scripts/build-baseline-oracle.mjs                 baseline from test/oracle/baseline-commit.txt
//   node scripts/build-baseline-oracle.mjs --commit <sha>  any commit
//   node scripts/build-baseline-oracle.mjs --source        current working tree (sanity)
//   ... --mutate "<file>::<search>::<replace>"             seeded mutant (oracle qualification)
//   ... --profile                                          PROFILE build exposing
//                                                          setRuntimeProjectionObserver
//   ... --out <dir>                                        output directory
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const fromSource = args.includes("--source");
const profile = args.includes("--profile");
const mutations = args
  .map((arg, index) => (arg === "--mutate" ? args[index + 1] : undefined))
  .filter(Boolean)
  .map((spec) => {
    const [file, search, replace] = spec.split("::");
    return { file, search, replace };
  });

const pinned = readFileSync(
  path.join(packageRoot, "test/oracle/baseline-commit.txt"),
  "utf8",
).trim();
const commit = fromSource ? "working-tree" : (option("--commit") ?? pinned);
const resolvedCommit = fromSource
  ? "working-tree"
  : execFileSync("git", ["rev-parse", commit], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

const label =
  resolvedCommit.slice(0, 12) +
  (profile ? "-profile" : "") +
  (mutations.length === 0
    ? ""
    : "-mutant-" +
      createHash("sha256")
        .update(JSON.stringify(mutations))
        .digest("hex")
        .slice(0, 8));
const out = path.resolve(
  option("--out") ?? path.join(packageRoot, ".cache/oracle", label),
);

const work = mkdtempSync(path.join(tmpdir(), "reflex-oracle-"));
try {
  const archived = path.join(work, "pkg");
  mkdirSync(archived, { recursive: true });
  if (fromSource) {
    for (const dir of ["src", "debug"]) {
      cpSync(path.join(packageRoot, dir), path.join(archived, dir), {
        recursive: true,
      });
    }
  } else {
    const tar = path.join(work, "baseline.tar");
    writeFileSync(
      tar,
      execFileSync(
        "git",
        [
          "archive",
          "--format=tar",
          `--prefix=pkg/`,
          `${resolvedCommit}:packages/reflex-runtime`,
          "src",
          "debug",
        ],
        { cwd: repoRoot, maxBuffer: 1 << 28 },
      ),
    );
    execFileSync("tar", ["-xf", "baseline.tar"], { cwd: work });
  }

  for (const { file, search, replace } of mutations) {
    const target = path.join(archived, file);
    const source = readFileSync(target, "utf8");
    if (!source.includes(search)) {
      throw new Error(`Mutation search text not found in ${file}: ${search}`);
    }
    writeFileSync(target, source.replace(search, replace));
  }

  const sources = path.join(archived, "src");
  const aliasPlugin = {
    name: "baseline-runtime-alias",
    setup(build) {
      build.onResolve({ filter: /^@runtime(\/|$)/ }, (args) => {
        const rest = args.path.replace(/^@runtime\/?/, "");
        const base = path.join(sources, rest);
        for (const candidate of [
          `${base}.ts`,
          path.join(base, "index.ts"),
          base,
        ]) {
          if (existsSync(candidate)) return { path: candidate };
        }
        return {
          errors: [{ text: `Unresolved baseline import ${args.path}` }],
        };
      });
      build.onResolve({ filter: /^@volynets\/algorithm-projection$/ }, () => ({
        path: "algorithm-projection",
        namespace: "type-only",
      }));
      build.onLoad({ filter: /.*/, namespace: "type-only" }, () => ({
        contents: "export {};",
        loader: "js",
      }));
    },
  };

  // Same compile-time flags as the source test configuration.
  const flags = {
    __DEV__: "false",
    __PROFILE__: profile ? "true" : "false",
    __TRACKING_ONE_HOP__: "true",
    __TRACKING_TWO_HOP__: "true",
    __TRACKING_LAST_EDGE__: "true",
    __TEST__: "true",
    __PROD__: "false",
  };

  mkdirSync(out, { recursive: true });
  await esbuild.build({
    ...(profile
      ? {
          stdin: {
            contents: [
              `export * from ${JSON.stringify(path.join(sources, "internal/index.ts"))};`,
              `export { setRuntimeProjectionObserver } from ${JSON.stringify(path.join(sources, "kernel/projection.ts"))};`,
            ].join("\n"),
            resolveDir: sources,
            loader: "ts",
          },
        }
      : { entryPoints: [path.join(sources, "internal/index.ts")] }),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    define: flags,
    plugins: [aliasPlugin],
    outfile: path.join(out, "runtime.mjs"),
    logLevel: "error",
  });

  const bundle = readFileSync(path.join(out, "runtime.mjs"));
  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify(
      {
        commit: resolvedCommit,
        mutations,
        profile,
        flags,
        esbuild: esbuild.version,
        bundleSha256: createHash("sha256").update(bundle).digest("hex"),
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`${path.relative(packageRoot, out)}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
