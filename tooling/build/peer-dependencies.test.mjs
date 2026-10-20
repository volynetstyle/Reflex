import test from "node:test";
import assert from "node:assert/strict";
import { packagesInScope, readPackage } from "./package-registry.mjs";

// Published Reflex packages relate to each other only through peers, so an
// application installs exactly one copy of each and every extension observes
// the same runtime. Third-party dependencies of tools are outside this rule.
const published = packagesInScope("publish");
const internal = new Set(published.map((entry) => entry.name));
const manifests = new Map(await Promise.all(published.map(async (entry) => [entry.name, await readPackage(entry)])));

function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match && match.slice(1).map(Number);
}

/** Caret ranges only: the form every internal peer uses. */
function satisfiesCaret(version, range) {
  const lower = parseVersion(range.slice(1));
  const actual = parseVersion(version);
  if (!range.startsWith("^") || !lower || !actual) return false;
  const pivot = lower[0] !== 0 ? 0 : lower[1] !== 0 ? 1 : 2;
  for (let i = 0; i <= pivot; ++i) if (actual[i] !== lower[i]) return false;
  for (let i = pivot + 1; i < 3; ++i) if (actual[i] !== lower[i]) return actual[i] > lower[i];
  return true;
}

test("the caret oracle follows npm semantics for 0.x and 1.x ranges", () => {
  assert.equal(satisfiesCaret("1.4.0", "^1.0.1"), true);
  assert.equal(satisfiesCaret("1.0.0", "^1.0.1"), false);
  assert.equal(satisfiesCaret("2.0.0", "^1.0.1"), false);
  assert.equal(satisfiesCaret("0.1.9", "^0.1.4"), true);
  assert.equal(satisfiesCaret("0.2.0", "^0.1.4"), false);
  assert.equal(satisfiesCaret("0.0.3", "^0.0.2"), false);
  assert.equal(satisfiesCaret("1.0.1", "workspace:*"), false);
});

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
      assert.ok(satisfiesCaret(version, "^" + version), name + " peer " + peer + " has a non-semver workspace version " + version);
      assert.equal(manifest.devDependencies?.[peer], "workspace:*", name + " must link its peer " + peer + " from the workspace for builds and tests");
    }
  });
}
