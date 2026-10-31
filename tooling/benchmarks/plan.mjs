// Prints the GitHub Actions matrix of the bench suites in suites.json.
//
//   node tooling/benchmarks/plan.mjs [--base <rev> --head <rev>]
//
// With two revisions a suite is kept only when one of its subjects differs
// between them (git tree or blob identity, so no checkout or build is needed):
// timing identical code on both sides reports noise, not a change. Both
// revisions must be present in the repository that runs this script.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { options } from "./io.mjs";

export const suites = JSON.parse(readFileSync(new URL("./suites.json", import.meta.url), "utf8")).suites;

export function changedSubjects(suite, objectId) {
  return suite.subjects.filter(path => objectId(path, "base") !== objectId(path, "head"));
}
export function plan(entries, objectId) {
  const include = [], skipped = [];
  for (const suite of entries) {
    const changed = objectId ? changedSubjects(suite, objectId) : suite.subjects;
    if (changed.length === 0) { skipped.push(suite.suite); continue; }
    include.push({ suite: suite.suite, package: suite.package, files: suite.files.join(" "), protocol: suite.protocol.join(" "), changed: changed.join(" ") });
  }
  return { include, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = options(process.argv.slice(2), ["--base", "--head"]);
  if (Boolean(opts.base) !== Boolean(opts.head)) throw new Error("Give both --base and --head, or neither");
  const revisions = { base: opts.base, head: opts.head };
  // A missing path has no object id; it differs from any present one.
  const objectId = (path, side) => {
    try { return execFileSync("git", ["rev-parse", "-q", "--verify", revisions[side] + ":" + path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
  };
  const { include, skipped } = plan(suites, opts.base ? objectId : null);
  console.log("matrix=" + JSON.stringify({ include }));
  console.log("any=" + (include.length > 0));
  console.log("skipped=" + skipped.join(" "));
}
