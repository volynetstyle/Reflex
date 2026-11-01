import test from "node:test";
import assert from "node:assert/strict";
import { peerDependentReleases } from "./version-peers.mjs";

test("versioning includes transitive peer dependents once without changing unrelated packages", () => {
  const manifests = [
    { name: "dom", peerDependencies: { framework: "workspace:^", runtime: "workspace:^" } },
    { name: "framework", peerDependencies: { runtime: "workspace:^" } },
    { name: "runtime" },
    { name: "other" },
  ];
  assert.deepEqual(peerDependentReleases(manifests, [{ name: "runtime", type: "patch" }, { name: "framework", type: "none" }]), ["dom", "framework"]);
  assert.deepEqual(peerDependentReleases(manifests, [{ name: "runtime", type: "minor" }, { name: "framework", type: "major" }]), ["dom"]);
  assert.deepEqual(peerDependentReleases(manifests, [{ name: "runtime", type: "none" }]), []);
});
