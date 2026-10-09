import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { options, required, readJson, writeJson, fingerprint, sha256 } from "./io.mjs";
import { protocolManifest } from "./protocol.mjs";

export function transplantProtocol({ baseRoot, headRoot, entries, configEvidence }) {
  const base = realpathSync(baseRoot), head = realpathSync(headRoot);
  if (base === head) throw new Error("Protocol migration requires two isolated checkouts");
  if (configEvidence.schemaVersion !== 1 || configEvidence.equivalent !== true || !Array.isArray(configEvidence.checks) || !configEvidence.checks.length || configEvidence.checks.some(c => c.passed !== true)) throw new Error("Migration requires passing resolved config equivalence evidence");
  if (realpathSync(configEvidence.baseRoot) !== base || realpathSync(configEvidence.headRoot) !== head) throw new Error("Config evidence belongs to different checkouts");
  const originalBase = protocolManifest(base, entries), originalHead = protocolManifest(head, entries);
  const manifest = { schemaVersion: 1, baselineMigration: originalBase.protocolHash !== originalHead.protocolHash, originalBase, originalHead, configEvidenceHash: fingerprint(configEvidence), copied: [], policy: "head protocol closure transplanted onto base subject; production src/build/dist never copied" };
  for (const file of originalHead.files) {
    if (/^packages\/[^/]+\/(src|build|dist)\//.test(file.path)) throw new Error("Subject copy rejected: " + file.path);
    const from = resolve(head, file.path), to = resolve(base, file.path), rel = relative(base, to);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep)) throw new Error("Migration target escapes base");
    // Reject a pre-existing symlink that points outside the isolated checkout.
    if (existsSync(to)) {
      const actual = relative(base, realpathSync(to));
      if (isAbsolute(actual) || actual === ".." || actual.startsWith(".." + sep)) throw new Error("Migration target symlink escapes base");
    }
    const previous = existsSync(to) ? sha256(readFileSync(to)) : null;
    mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to);
    manifest.copied.push({ path: file.path, originalBaseHash: previous, headHash: file.sha256 });
  }
  const migrated = protocolManifest(base, entries);
  if (migrated.protocolHash !== originalHead.protocolHash) throw new Error("migration-required: head closure remains non-equivalent; subject boundary unresolved");
  manifest.protocolHash = migrated.protocolHash;
  manifest.cohortMigrationHash = fingerprint({ originalBase: originalBase.protocolHash, originalHead: originalHead.protocolHash, configEvidenceHash: manifest.configEvidenceHash, copied: manifest.copied });
  return manifest;
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--base-root", "--head-root", "--entries", "--config-evidence", "--json"]);
  const result = transplantProtocol({ baseRoot: required(opts, "base-root"), headRoot: required(opts, "head-root"), entries: required(opts, "entries").split(",").filter(Boolean), configEvidence: readJson(required(opts, "config-evidence")) });
  writeJson(required(opts, "json"), result); console.log(result.protocolHash);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
