// Builds a frozen, self-contained runtime bundle from a fixed commit for
// differential testing (test/oracle). The bundle resolves every internal
// import to the archived baseline sources, so it shares no code with the
// implementation under test.
//
//   node scripts/build-baseline-oracle.mjs                 baseline from testkit/oracle/baseline-commit.txt
//   node scripts/build-baseline-oracle.mjs --commit <sha>  any commit
//   node scripts/build-baseline-oracle.mjs --source        current working tree (sanity)
//   ... --mutate "<file>::<search>::<replace>"             seeded mutant (oracle qualification)
//   ... --overlay "<file>=<path>"                          replace an archived source file by
//                                                          the file at <path> (research variants)
//   ... --production                                       production flags, minified like dist
//   ... --readable                                         production without identifier mangling
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
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
// Production flags and minification, for performance comparison bundles.
const production = args.includes("--production");
// Production bundle with original identifiers, for CPU profiles.
const readable = args.includes("--readable");
const mutations = args
  .map((arg, index) => (arg === "--mutate" ? args[index + 1] : undefined))
  .filter(Boolean)
  .map((spec) => {
    const [file, search, replace] = spec.split("::");
    return { file, search, replace };
  });

// Applied before the mutations, so a mutation may target an overlaid file.
const overlays = args
  .map((arg, index) => (arg === "--overlay" ? args[index + 1] : undefined))
  .filter(Boolean)
  .map((spec) => {
    const at = spec.indexOf("=");
    const file = spec.slice(0, at);
    const contents = readFileSync(path.resolve(spec.slice(at + 1)), "utf8");
    return { file, contents };
  });

const pinned = readFileSync(
  path.join(packageRoot, "testkit/oracle/baseline-commit.txt"),
  "utf8",
).trim();
const commit = fromSource ? "working-tree" : (option("--commit") ?? pinned);

// Shallow clones (CI checkouts) lack the pinned commit; fetch just that one.
// Test workers build in parallel, so a fetch can lose the shallow.lock race
// to a sibling: retry until the commit appears, whoever fetched it.
const hasCommit = (ref) => {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};
if (!fromSource && !hasCommit(commit) && /^[0-9a-f]{40}$/.test(commit)) {
  for (let attempt = 1; !hasCommit(commit); attempt += 1) {
    try {
      execFileSync(
        "git",
        ["fetch", "--no-tags", "--depth=1", "origin", commit],
        { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (error) {
      if (hasCommit(commit)) break;
      if (attempt >= 20) throw error;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        250 * attempt,
      );
    }
  }
}

const resolvedCommit = fromSource
  ? "working-tree"
  : execFileSync("git", ["rev-parse", commit], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

const label =
  resolvedCommit.slice(0, 12) +
  (profile ? "-profile" : "") +
  (production ? "-production" : "") +
  (readable ? "-readable" : "") +
  (mutations.length === 0 && overlays.length === 0
    ? ""
    : "-mutant-" +
      createHash("sha256")
        .update(JSON.stringify([mutations, overlays]))
        .digest("hex")
        .slice(0, 8));
const target = path.resolve(
  option("--out") ?? path.join(packageRoot, ".cache/oracle", label),
);
// Callers treat an existing runtime.mjs as complete, and test workers build
// concurrently: stage beside the target, then publish by atomic rename.
const out = `${target}.staging-${process.pid}`;

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

  for (const { file, contents } of overlays) {
    const target = path.join(archived, file);
    if (!existsSync(target))
      throw new Error(`Overlay target not found in the archive: ${file}`);
    writeFileSync(target, contents);
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
    __TEST__: production ? "false" : "true",
    __PROD__: production ? "true" : "false",
  };

  // The published production build inlines compile-time constants
  // (rollup/inline-constants.ts). Benchmark bundles must run the code that
  // ships, so production builds apply the same transform to every revision,
  // each with the constants of its own sources and the defines above.
  const plugins = [aliasPlugin];
  let inlinedConstants = 0;
  if (production) {
    const { collectConstants, inlineConstants } = await import(
      pathToFileURL(path.join(packageRoot, "rollup/inline-constants.ts")).href
    );
    const { readRuntimeSources } = await import(
      pathToFileURL(path.join(packageRoot, "rollup/plugins/inline-constants.ts"))
        .href
    );
    const table = collectConstants(readRuntimeSources(sources), flags);
    plugins.push({
      name: "inline-constants",
      setup(build) {
        build.onLoad({ filter: /.ts$/ }, (args) => {
          if (!args.path.startsWith(sources)) return undefined;
          const code = readFileSync(args.path, "utf8");
          const result = inlineConstants(code, args.path, table);
          if (result === null) return undefined;
          inlinedConstants += result.replaced;
          return { contents: result.code, loader: "ts" };
        });
      },
    });
  }

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
    plugins,
    outfile: path.join(out, "runtime.mjs"),
    minify: false,
    logLevel: "error",
  });

  if (production && inlinedConstants === 0)
    throw new Error("inline-constants: no constant reference was inlined");

  if (production) {
    // The published build minifies with Terser (rollup/terser-options.ts),
    // whose pure_funcs list removes DEV assertion calls that esbuild keeps.
    // Benchmark bundles must run the code that ships.
    const { createRuntimeTerserOptions } = await import(
      pathToFileURL(path.join(packageRoot, "rollup/terser-options.ts")).href
    );
    const { minify } = createRequire(require.resolve("@rollup/plugin-terser"))(
      "terser",
    );
    const options = createRuntimeTerserOptions(true);
    if (readable) {
      options.mangle = false;
      options.format = { ...options.format, beautify: true };
    }
    const bundlePath = path.join(out, "runtime.mjs");
    const minified = await minify(readFileSync(bundlePath, "utf8"), options);
    writeFileSync(bundlePath, minified.code);
  }

  const bundle = readFileSync(path.join(out, "runtime.mjs"));
  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify(
      {
        commit: resolvedCommit,
        mutations,
        overlays: overlays.map(({ file, contents }) => ({
          file,
          sha256: createHash("sha256").update(contents).digest("hex"),
        })),
        profile,
        production,
        flags,
        esbuild: esbuild.version,
        minifier: production ? "terser (rollup/terser-options.ts)" : "none",
        inlinedConstants,
        bundleSha256: createHash("sha256").update(bundle).digest("hex"),
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(target, { recursive: true });
  renameSync(
    path.join(out, "manifest.json"),
    path.join(target, "manifest.json"),
  );
  renameSync(path.join(out, "runtime.mjs"), path.join(target, "runtime.mjs"));
  process.stdout.write(`${path.relative(packageRoot, target)}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
}
