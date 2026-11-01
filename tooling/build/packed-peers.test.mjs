import test from "node:test";
import assert from "node:assert/strict";
import { verifyPackedPeers } from "./packed-peers.mjs";
import { packagesInScope, readPackage } from "./package-registry.mjs";

test("packed internal peers follow the qualified workspace version", async () => {
  const manifests = await Promise.all(packagesInScope("publish").map(readPackage));
  const versions = new Map(manifests.map(({ name, version }) => [name, version]));
  const source = manifests.find((manifest) => Object.keys(manifest.peerDependencies ?? {}).some((name) => versions.has(name)));
  assert.ok(source, "expected a package with an internal peer");
  const packedPeers = Object.fromEntries(Object.entries(source.peerDependencies).map(([name, range]) => [name, versions.has(name) ? `^${versions.get(name)}` : range]));
  const peer = Object.keys(source.peerDependencies).find((name) => versions.has(name));
  assert.doesNotThrow(() => verifyPackedPeers(source, { peerDependencies: packedPeers }, versions));
  assert.throws(() => verifyPackedPeers(source, { peerDependencies: { ...packedPeers, [peer]: "workspace:^" } }, versions), /must be/);
  assert.throws(() => verifyPackedPeers(source, { peerDependencies: {} }, versions), /missing/);
  assert.throws(() => verifyPackedPeers({ ...source, peerDependencies: { [peer]: packedPeers[peer] } }, {}, versions), /workspace:\^/);
});
