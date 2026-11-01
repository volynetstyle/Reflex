// Changesets does not schedule workspace:^ peer dependents for patch releases.
// Include the whole peer-dependent closure so every newly published archive
// can carry the new workspace version as its peer floor.
export function peerDependentReleases(manifests, releases) {
  const changed = new Set(releases.filter((release) => release.type !== "none").map((release) => release.name));
  const additional = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const manifest of manifests) {
      if (changed.has(manifest.name)) continue;
      if (Object.keys(manifest.peerDependencies ?? {}).some((peer) => changed.has(peer))) {
        changed.add(manifest.name);
        additional.add(manifest.name);
        progress = true;
      }
    }
  }
  return [...additional].sort();
}
