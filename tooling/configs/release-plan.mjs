// Decides whether main holds package versions that npm does not have yet.
//
//   node tooling/configs/release-plan.mjs
//
// Prints GitHub Actions outputs: `unpublished` (JSON list of name@version) and
// `publish` (true when the list is non-empty). The registry, not git tags, is
// the source of truth: a version exists once npm has it, however it got there.
import { spawnSync } from "node:child_process";
import { packagesInScope, readPackage } from "../build/package-registry.mjs";

const unpublished = [];
for (const entry of packagesInScope("publish")) {
  const { version } = await readPackage(entry);
  const spec = entry.name + "@" + version;
  const view = spawnSync("npm", ["view", spec, "version"], { encoding: "utf8", shell: process.platform === "win32" });
  if (view.status === 0 && view.stdout.trim() === version) continue;
  if (view.status !== 0 && !/E404/.test(view.stderr)) throw new Error("Cannot query the registry for " + spec + ":\n" + view.stderr);
  unpublished.push(spec);
}
console.log("unpublished=" + JSON.stringify(unpublished));
console.log("publish=" + (unpublished.length > 0));
