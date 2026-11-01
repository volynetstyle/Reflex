import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packagesInScope, readPackage, repoRoot } from "../build/package-registry.mjs";
import { runPnpm } from "../build/pnpm.mjs";
import { peerDependentReleases } from "./version-peers.mjs";

const temporary = await mkdtemp(join(tmpdir(), "reflex-release-plan-"));
const changeset = resolve(repoRoot, ".changeset", "automated-peer-versions.md");
let created = false;
try {
  const planFile = join(temporary, "plan.json");
  await runPnpm(["exec", "changeset", "status", "--output", planFile]);
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  const manifests = await Promise.all(packagesInScope("publish").map(readPackage));
  const peers = peerDependentReleases(manifests, plan.releases);
  if (peers.length) {
    const frontmatter = peers.map((name) => JSON.stringify(name) + ": patch").join("\n");
    await writeFile(changeset, `---\n${frontmatter}\n---\n\nUpdate internal peer dependency versions.\n`, { flag: "wx" });
    created = true;
  }
  await runPnpm(["exec", "changeset", "version"]);
} finally {
  if (created) await rm(changeset, { force: true });
  await rm(temporary, { recursive: true, force: true });
}
