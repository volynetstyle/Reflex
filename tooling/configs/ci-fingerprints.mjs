import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packageRegistry, repoRoot } from "../build/package-registry.mjs";
import { selectedPackages, validateRegistry } from "./quality-registry.mjs";

// Git's tracked input set excludes local build outputs and node_modules. Longest
// path wins so nested example apps remain independent of their parent package.
export function inputOwner(path, entries) {
  return [...entries].sort((a, b) => b.path.length - a.path.length)
    .find(entry => path === entry.path || path.startsWith(entry.path + "/"));
}
export function fingerprintInputs({ entries, manifests, files, phase }) {
  const dependencies = new Map(entries.map(entry => [entry.name, new Set()]));
  const owned = new Map(entries.map(entry => [entry.name, []]));
  const shared = [];
  for (const entry of entries) {
    const manifest = manifests[entry.name];
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
      if (dependencies.has(name)) dependencies.get(entry.name).add(name);
    }
  }
  for (const file of files) {
    if (/\.md$/i.test(file.path) && !/(^|\/)AGENTS\.md$/.test(file.path)) continue;
    const owner = inputOwner(file.path, entries);
    if (!owner) { shared.push(file); continue; }
    owned.get(owner.name).push(file);
    // Also account for source/test imports outside declared manifest edges.
    if (/\.[cm]?[jt]sx?$/.test(file.path)) {
      for (const entry of entries) {
        const directory = entry.path.split("/").at(-1);
        if (file.content.includes(entry.name) || file.content.includes("/" + directory + "/") || file.content.includes("/" + directory + '"') || file.content.includes("/" + directory + "'")) dependencies.get(owner.name).add(entry.name);
      }
      if (file.content.includes("@runtime") && dependencies.has("@volynets/reflex-runtime")) dependencies.get(owner.name).add("@volynets/reflex-runtime");
    }
  }
  const hash = names => {
    const closure = new Set();
    const visit = name => { if (closure.has(name)) return; closure.add(name); for (const dependency of dependencies.get(name)) visit(dependency); };
    names.forEach(visit);
    const inputs = [...shared, ...[...closure].flatMap(name => owned.get(name))].sort((a, b) => a.path.localeCompare(b.path));
    const digest = createHash("sha256").update(JSON.stringify({ version: 1, phase, packages: [...closure].sort() }));
    for (const file of inputs) digest.update(JSON.stringify([file.path, file.mode, createHash("sha256").update(file.content).digest("hex")]));
    return digest.digest("hex");
  };
  return { packages: Object.fromEntries(entries.map(entry => [entry.name, hash([entry.name])])), consumer: hash(entries.filter(entry => entry.publish).map(entry => entry.name)) };
}
async function main() {
  await validateRegistry();
  const phase = process.env.EVENT_NAME === "schedule" ? "deep" : "pr";
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" }).split("\0").filter(Boolean);
  const files = await Promise.all(paths.map(async path => {
    const stat = await lstat(resolve(repoRoot, path));
    return { path, mode: stat.mode & 0o111, content: await readFile(resolve(repoRoot, path)) };
  }));
  const manifests = Object.fromEntries(await Promise.all(packageRegistry.map(async entry => [entry.name, JSON.parse(await readFile(resolve(repoRoot, entry.path, "package.json"), "utf8"))])));
  const fingerprints = fingerprintInputs({ entries: packageRegistry, manifests, files, phase });
  console.log("matrix=" + JSON.stringify({ include: selectedPackages(phase).map(entry => ({ id: entry.id, package: entry.name, browser: Boolean(entry.requiresBrowser), fingerprint: fingerprints.packages[entry.name] })) }));
  console.log("phase=" + phase);
  console.log("consumer=" + fingerprints.consumer);
  console.log("reuse=" + !["schedule", "workflow_dispatch"].includes(process.env.EVENT_NAME));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
