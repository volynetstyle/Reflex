import test from "node:test";
import assert from "node:assert/strict";
import { packagesInScope, readPackage } from "./package-registry.mjs";

// Published Reflex packages relate to each other only through peers, so an
// application installs exactly one copy of each and every extension observes
// the same runtime. Third-party dependencies of tools are outside this rule.
const published = packagesInScope("publish");
const internal = new Set(published.map((entry) => entry.name));
const manifests = new Map(await Promise.all(published.map(async (entry) => [entry.name, await readPackage(entry)])));

for (const [name, manifest] of manifests) {
  test(name + " reaches other Reflex packages only through peers", () => {
    for (const field of ["dependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) {
      const value = manifest[field] ?? {};
      const names = Array.isArray(value) ? value : Object.keys(value);
      const offending = names.filter((dependency) => internal.has(dependency));
      assert.deepEqual(offending, [], name + " declares Reflex packages in " + field + "; use peerDependencies");
    }
    for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (!internal.has(peer)) continue;
      // pnpm packs workspace:^ as ^<workspace version>, so the published floor
      // always follows the release instead of a hand-edited range.
      assert.equal(range, "workspace:^", name + " peer " + peer + " must use workspace:^");
      const version = manifests.get(peer).version;
      assert.match(version, /^\d+\.\d+\.\d+$/, name + " peer " + peer + " has a non-semver workspace version " + version);
      assert.equal(manifest.devDependencies?.[peer], "workspace:*", name + " must link its peer " + peer + " from the workspace for builds and tests");
    }
  });
}
