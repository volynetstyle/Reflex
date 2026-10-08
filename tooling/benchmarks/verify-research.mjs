import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { options, readJson, sha256, required } from "./io.mjs";
export function verifyResearch(root, manifest) {
  const base = realpathSync(root);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw new Error("Invalid research manifest");
  const seen = new Set(); let totalBytes = 0;
  for (const item of manifest.artifacts) {
    if (!item.path || isAbsolute(item.path) || seen.has(item.path) || !/^[a-f\d]{64}$/.test(item.sha256)) throw new Error("Invalid/duplicate artifact path or checksum");
    seen.add(item.path);
    const target = realpathSync(resolve(base, item.path)), rel = relative(base, target);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep)) throw new Error("Research artifact escapes root");
    const bytes = readFileSync(target);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw new Error("Historical bytes changed: " + item.path);
    totalBytes += bytes.length;
  }
  return { files: seen.size, bytes: totalBytes, status: "checksum-identical" };
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--root", "--manifest"]);
  console.log(JSON.stringify(verifyResearch(opts.root ?? process.cwd(), readJson(required(opts, "manifest")))));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
