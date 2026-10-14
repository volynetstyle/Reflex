// Tags HEAD with name@version for every version this commit's archives put on
// npm (or match byte for byte), and writes the release summary.
//
//   node tooling/configs/release-tags.mjs <publication-dir>
//
// A "version-taken" archive differs from what npm already has under that
// version: the commit holds unreleased changes without a version bump. It is
// reported and never tagged, because the tag would point at other code.
import { execFileSync } from "node:child_process";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "../build/package-registry.mjs";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: release-tags.mjs <publication-dir>");
const reports = [];
for (const entry of await readdir(directory, { recursive: true }).catch(() => [])) {
  if (entry.endsWith("publication.json")) reports.push(JSON.parse(await readFile(join(directory, entry), "utf8")));
}
const attempts = new Map();
for (const report of reports) for (const attempt of report.attempts) attempts.set(attempt.name, attempt);

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const exists = (tag) => { try { git("rev-parse", "-q", "--verify", "refs/tags/" + tag); return true; } catch { return false; } };
const rows = [];
for (const attempt of [...attempts.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const tag = attempt.name + "@" + attempt.version;
  if ((attempt.status === "published" || attempt.status === "already-published") && !exists(tag)) git("tag", tag);
  if (attempt.status === "version-taken") console.log(`::warning title=${tag}::npm already has this version with different contents; bump it with a changeset to release these changes`);
  if (attempt.status === "failed") console.log(`::error title=${tag}::npm publish failed; rerun the job to resume`);
  rows.push(`| ${attempt.name} | ${attempt.version} | ${attempt.status} |`);
}
const summary = ["### npm publication", "", rows.length ? "| Package | Version | Result |\n| --- | --- | --- |\n" + rows.join("\n") : "No publication was attempted.", ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
else console.log(summary);
