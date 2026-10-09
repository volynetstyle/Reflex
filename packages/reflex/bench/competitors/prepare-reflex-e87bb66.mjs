import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SNAPSHOT_COMMIT = "e87bb662be4e1bc4fb9885360d214017e8ba3a5c";
const SNAPSHOT_BRANCH = "benchmark/reflex-e87bb66";
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../../..");
const worktree = resolve(repository, ".bench-worktrees/reflex-e87bb66");
const facadeArtifact = resolve(worktree, "packages/reflex/dist/esm/index.js");
const projectionArtifact = resolve(
  worktree,
  "third-party/algorithm-projection/dist/index.js",
);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd = repository, output = "inherit") {
  return execFileSync(command, args, {
    cwd,
    encoding: output === "pipe" ? "utf8" : undefined,
    stdio: output,
  });
}

function gitOutput(args, cwd = repository) {
  return run("git", args, cwd, "pipe").trim();
}

function hasCommit() {
  try {
    run(
      "git",
      ["cat-file", "-e", `${SNAPSHOT_COMMIT}^{commit}`],
      repository,
      "pipe",
    );
    return true;
  } catch {
    return false;
  }
}

function prepareWorktree() {
  if (!hasCommit()) {
    console.log(
      `Fetching pinned Reflex snapshot ${SNAPSHOT_COMMIT.slice(0, 7)}…`,
    );
    run("git", ["fetch", "origin", SNAPSHOT_COMMIT]);
  }

  if (!existsSync(worktree)) {
    mkdirSync(dirname(worktree), { recursive: true });
    let branchCommit;
    try {
      branchCommit = gitOutput(["rev-parse", "--verify", SNAPSHOT_BRANCH]);
    } catch {
      branchCommit = undefined;
    }
    if (branchCommit && branchCommit !== SNAPSHOT_COMMIT) {
      throw new Error(
        `${SNAPSHOT_BRANCH} points to ${branchCommit}, not ${SNAPSHOT_COMMIT}. ` +
          "Choose another branch name or move the branch explicitly before running the benchmark.",
      );
    }
    run(
      "git",
      branchCommit
        ? ["worktree", "add", worktree, SNAPSHOT_BRANCH]
        : ["worktree", "add", "-b", SNAPSHOT_BRANCH, worktree, SNAPSHOT_COMMIT],
    );
  }

  const checkedOutCommit = gitOutput(["rev-parse", "HEAD"], worktree);
  if (checkedOutCommit !== SNAPSHOT_COMMIT) {
    throw new Error(
      `Snapshot worktree is at ${checkedOutCommit}, expected ${SNAPSHOT_COMMIT}. ` +
        "Its history is deliberately not changed by the benchmark setup.",
    );
  }
}

prepareWorktree();

if (!existsSync(resolve(worktree, "node_modules"))) {
  console.log("Installing locked dependencies for Reflex e87bb66…");
  run(pnpm, ["install", "--frozen-lockfile"], worktree);
}

if (!existsSync(facadeArtifact)) {
  if (!existsSync(projectionArtifact)) {
    console.log("Building historical algorithm-projection prerequisite…");
    run(
      pnpm,
      ["--filter", "@volynets/algorithm-projection", "build"],
      worktree,
    );
  }
  console.log("Building pinned Reflex e87bb66 production facade…");
  run(pnpm, ["--filter", "@volynets/reflex", "build:all"], worktree);
}

console.log(`Prepared Reflex e87bb66 on ${SNAPSHOT_BRANCH}: ${facadeArtifact}`);
