// Records or checks the execution-domain baseline
// (docs/architecture/execution-domains.baseline.json).
//
//   node scripts/record-domain-baseline.mjs           write the baseline
//   node scripts/record-domain-baseline.mjs --check   fail if hot-path sources
//                                                     differ from the baseline
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const output = path.join(
  repoRoot,
  "docs/architecture/execution-domains.baseline.json",
);

function collect(directory, files = []) {
  for (const entry of readdirSync(path.join(packageRoot, directory), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative, files);
    else if (relative.endsWith(".ts")) files.push(relative);
  }
  return files;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// Line endings are normalized so Windows and POSIX checkouts agree.
function sourceHash(file) {
  return sha256(
    readFileSync(path.join(packageRoot, file), "utf8").replace(/\r\n/g, "\n"),
  );
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const hotPath = [
  "src/kernel/shape/node.ts",
  "src/kernel/shape/edge.ts",
  "src/kernel/state.ts",
  "src/protocol/read.producer.ts",
  "src/protocol/read.consumer.ts",
  "src/protocol/write.producer.ts",
  "src/protocol/watcher.ts",
  ...collect("src/kernel/shape/tracking"),
  ...collect("src/kernel/shape/graph"),
  ...collect("src/kernel/stages"),
  ...collect("src/kernel/engine"),
].sort();

const hotPathHashes = Object.fromEntries(
  hotPath.map((file) => [file, sourceHash(file)]),
);

if (process.argv.includes("--check")) {
  const baseline = JSON.parse(readFileSync(output, "utf8"));
  const changed = Object.keys({ ...baseline.hotPath, ...hotPathHashes }).filter(
    (file) => baseline.hotPath[file] !== hotPathHashes[file],
  );
  if (changed.length > 0) {
    throw new Error(
      `Hot-path sources differ from the execution-domain baseline:\n- ${changed.join("\n- ")}`,
    );
  }
  process.stdout.write("Hot-path sources match the execution-domain baseline.\n");
} else {
  const lockfile = path.join(repoRoot, "pnpm-lock.yaml");
  const baseline = {
    recordedFor: "execution-domains PR-00",
    commit: git("rev-parse", "HEAD"),
    dirtyPaths: (git("status", "--porcelain") ?? "")
      .split("\n")
      .filter(Boolean).length,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileSha256: existsSync(lockfile)
      ? sha256(readFileSync(lockfile))
      : null,
    buildConditions: ["production", "development", "profile"],
    benchmarkCohorts: [
      "bench:runtime",
      "bench:cost-attribution",
      "bench:quality-gate",
    ],
    hotPath: hotPathHashes,
  };
  writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(`Wrote ${path.relative(repoRoot, output)}\n`);
}
