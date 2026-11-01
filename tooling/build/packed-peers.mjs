// Verify the actual archive, not just the source manifest: pnpm must replace
// every internal workspace peer with the version that was just qualified.
export function verifyPackedPeers(source, packed, versions) {
  for (const [name, range] of Object.entries(source.peerDependencies ?? {})) {
    if (!versions.has(name)) continue;
    if (range !== "workspace:^") throw new Error(`${source.name}: internal peer ${name} must use workspace:^`);
    const expected = `^${versions.get(name)}`;
    if (packed.peerDependencies?.[name] !== expected) {
      throw new Error(`${source.name}: packed peer ${name} must be ${expected}, got ${packed.peerDependencies?.[name] ?? "missing"}`);
    }
  }
}
