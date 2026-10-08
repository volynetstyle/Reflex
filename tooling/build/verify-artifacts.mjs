import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { resolve, join, posix, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { packageRegistry, packagesInScope, repoRoot } from "./package-registry.mjs";
import { runPnpm } from "./pnpm.mjs";

function invariant(ok, message) { if (!ok) throw new Error(message); }
function safePath(name) {
  invariant(!name.includes("\\") && !name.startsWith("/"), "Unsafe artifact path: " + name);
  const normalized = posix.normalize(name.replace(/^\.\//, ""));
  invariant(normalized !== ".." && !normalized.startsWith("../") && !/^[A-Za-z]:/.test(normalized), "Artifact path escapes package: " + name);
  return normalized;
}
function textField(header, start, length) { return header.subarray(start, start + length).toString("utf8").split("\0")[0]; }
function paxValues(bytes) {
  const fields = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    invariant(space > offset, "Invalid PAX field");
    const size = Number(bytes.subarray(offset, space).toString());
    invariant(Number.isSafeInteger(size) && size > space - offset + 1 && offset + size <= bytes.length, "Invalid PAX field size");
    const record = bytes.subarray(space + 1, offset + size - 1).toString("utf8");
    const equal = record.indexOf("=");
    invariant(equal > 0, "Invalid PAX field value");
    fields[record.slice(0, equal)] = record.slice(equal + 1);
    offset += size;
  }
  return fields;
}

// Read, rather than extract, archives: no untrusted archive path reaches the filesystem.
export async function readArchive(archivePath) {
  const compressed = await readFile(archivePath);
  const bytes = gunzipSync(compressed);
  const files = new Map();
  const modes = new Map();
  let offset = 0;
  let extended = {};
  let longName;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const checksum = parseInt(textField(header, 148, 8).trim(), 8);
    const actual = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    invariant(checksum === actual, "Invalid tar header checksum");
    const size = parseInt(textField(header, 124, 12).trim() || "0", 8);
    invariant(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= bytes.length, "Invalid tar entry size");
    const content = bytes.subarray(offset + 512, offset + 512 + size);
    const type = textField(header, 156, 1);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { extended = paxValues(content); continue; }
    if (type === "g") { invariant(!paxValues(content).path, "Global PAX path is unsupported"); continue; }
    if (type === "L") { longName = content.toString("utf8").split("\0")[0]; continue; }
    const prefix = textField(header, 345, 155);
    const name = extended.path ?? longName ?? (prefix ? prefix + "/" : "") + textField(header, 0, 100);
    extended = {};
    longName = undefined;
    invariant(name.startsWith("package/"), "Unexpected npm archive root: " + name);
    const local = safePath(name.slice(8));
    if (type === "5") continue;
    invariant(type === "0" || type === "", "Archive must contain regular files, not links: " + name);
    invariant(!files.has(local), "Duplicate artifact file: " + local);
    files.set(local, Buffer.from(content));
    modes.set(local, parseInt(textField(header, 100, 8).trim() || "0", 8));
  }
  invariant(files.has("package.json"), "Archive has no package.json");
  return { files, modes, sha256: createHash("sha256").update(compressed).digest("hex") };
}

function targets(value, condition = "exports") {
  if (typeof value === "string") return [{ target: value, condition }];
  if (value === null) return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => targets(entry, condition + "[" + index + "]"));
  return Object.entries(value ?? {}).flatMap(([name, entry]) => targets(entry, condition + "." + name));
}
function packageName(specifier) { return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]; }
function importsOf(source, filename) {
  const parsed = ts.preProcessFile(source, true, true);
  const imports = new Set(parsed.importedFiles.map((entry) => entry.fileName));
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false);
  const buildFlags = new Set();
  function visit(node, parent) {
    if (ts.isIdentifier(node) && /^__(?:DEV|TEST|PROD|PROFILE|TRACKING_\w+)__$/.test(node.text)) {
      const propertyName = parent && (ts.isPropertyAccessExpression(parent) && parent.name === node || ts.isPropertyAssignment(parent) && parent.name === node || ts.isPropertyDeclaration(parent) && parent.name === node);
      if (!propertyName) buildFlags.add(node.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) imports.add(node.arguments[0].text);
    ts.forEachChild(node, (child) => visit(child, node));
  }
  visit(ast);
  return { buildFlags: [...buildFlags], imports: [...imports], references: parsed.referencedFiles.map((entry) => entry.fileName), typeReferences: parsed.typeReferenceDirectives.map((entry) => entry.fileName) };
}
function localTarget(files, from, specifier, declaration) {
  const base = safePath(posix.join(posix.dirname(from), specifier));
  const candidates = declaration ? [base.replace(/\.mjs$/, ".d.mts").replace(/\.cjs$/, ".d.cts").replace(/\.js$/, ".d.ts"), base] : [base];
  return candidates.find((candidate) => files.has(candidate));
}

export function verifyFiles(files, { packed = true, expectedName } = {}) {
  const manifest = JSON.parse(files.get("package.json").toString("utf8"));
  if (expectedName) invariant(manifest.name === expectedName, "Unexpected package: " + manifest.name);
  invariant(manifest.private !== true, "Private package is not a publication artifact: " + manifest.name);
  if (packed) for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) invariant(!version.startsWith("workspace:"), manifest.name + ": unconverted workspace dependency " + name);
  }
  const entries = targets(manifest.exports);
  for (const field of ["main", "module", "types", "typings"]) if (manifest[field]) entries.push({ target: manifest[field], condition: field });
  const bins = typeof manifest.bin === "string" ? { [manifest.name]: manifest.bin } : manifest.bin ?? {};
  for (const [name, target] of Object.entries(bins)) {
    const file = files.get(safePath(target));
    invariant(file, manifest.name + ": missing bin target " + target);
    invariant(file.toString("utf8").startsWith("#!/usr/bin/env node\n") || file.toString("utf8").startsWith("#!/usr/bin/env node\r\n"), manifest.name + ": bin has no portable Node shebang: " + name);
    entries.push({ target, condition: "bin." + name });
  }
  const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies }));
  const builtins = new Set(builtinModules.flatMap((name) => [name, "node:" + name]));
  const seen = new Set();
  const externals = new Set();
  function inspect(file, standalone = false) {
    const key = (standalone ? "standalone:" : "library:") + file;
    if (seen.has(key)) return;
    seen.add(key);
    const declaration = /\.d\.(?:ts|mts|cts)$/.test(file);
    if (!declaration && !/\.(?:js|mjs|cjs)$/.test(file)) return;
    const source = files.get(file).toString("utf8");
    const info = importsOf(source, file);
    if (!declaration && !/(?:^|\/)(?:dev|cjs-dev)(?:\/|$)/.test(file)) invariant(info.buildFlags.length === 0, manifest.name + ": unresolved production build flags in " + file + ": " + info.buildFlags.join(", "));
    for (const specifier of [...info.imports, ...info.references]) {
      if (specifier.startsWith(".")) {
        const target = localTarget(files, file, specifier, declaration);
        invariant(target, manifest.name + ": unresolved artifact import " + file + " -> " + specifier);
        if (standalone) invariant(target.startsWith("standalone/"), "Standalone import leaves its graph: " + file + " -> " + target);
        inspect(target, standalone);
      } else {
        invariant(!isAbsolute(specifier) && !/^[A-Za-z]:/.test(specifier), manifest.name + ": absolute artifact import " + specifier);
        invariant(!standalone, "Standalone depends on external module: " + specifier);
        const name = packageName(specifier);
        invariant(builtins.has(specifier) || specifier.startsWith("node:") || dependencies.has(name), manifest.name + ": undeclared artifact dependency " + specifier + " in " + file);
        externals.add(specifier);
      }
    }
    for (const reference of info.typeReferences) {
      invariant(!standalone, "Standalone requires external types: " + reference);
      const name = reference.startsWith("@") ? reference.slice(1).replace("/", "__") : reference;
      invariant(dependencies.has("@types/" + name), manifest.name + ": undeclared type dependency " + reference);
    }
  }
  for (const entry of entries) {
    invariant(!entry.target.includes("*"), "Pattern exports require an explicit verifier expansion: " + entry.target);
    const file = safePath(entry.target);
    invariant(files.has(file), manifest.name + ": missing " + entry.condition + " target " + entry.target);
    // The source condition is a compiler/development contract, not an emitted Node graph.
    if (!entry.condition.split(".").includes("source")) inspect(file, file.startsWith("standalone/"));
  }
  if (manifest.peerDependencies?.["@volynets/reflex-runtime"]) invariant([...externals].some((name) => name === "@volynets/reflex-runtime" || name.startsWith("@volynets/reflex-runtime/")), manifest.name + ": shared runtime peer was embedded or removed from the library graph");
  return { name: manifest.name, version: manifest.version, fileCount: files.size, exportTargets: entries.length, bins: Object.keys(bins), externalSpecifiers: [...externals].sort() };
}

export async function verifyArchive(archivePath, options = {}) {
  const { files, modes, sha256 } = await readArchive(archivePath);
  const manifest = JSON.parse(files.get("package.json").toString("utf8"));
  const bins = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const target of bins) invariant((modes.get(safePath(target)) & 0o111) !== 0, manifest.name + ": bin is not executable in archive: " + target);
  return { ...verifyFiles(files, { ...options, packed: true }), archive: resolve(archivePath), archivePath: resolve(archivePath), sha256, manifest,
    files: [...files].map(([path, bytes]) => ({ path, size: bytes.length, mode: modes.get(path), sha256: createHash("sha256").update(bytes).digest("hex") })) };
}
export async function verifyDirectory(packageDir) {
  const project = resolve(packageDir);
  const source = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  const publicationRoot = resolve(project, source.publishConfig?.directory ?? ".");
  const local = relative(project, publicationRoot);
  invariant(!local.startsWith("..") && !isAbsolute(local), "Publication root escapes package directory");
  const files = new Map();
  async function collect(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "build", ".git", ".cache", "bench", "perf", "lab", "test", "tests", "examples", "scripts", "docs"].includes(entry.name)) continue;
      const name = prefix + entry.name;
      if (entry.isDirectory()) await collect(join(directory, entry.name), name + "/");
      else if (entry.isFile()) files.set(name, await readFile(join(directory, entry.name)));
    }
  }
  await collect(publicationRoot);
  return { ...verifyFiles(files, { packed: false, expectedName: source.name }), publicationRoot };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--directory") { console.log(JSON.stringify(await verifyDirectory(args[1] ?? "."), null, 2)); return; }
  if (args[0] === "--archive") { console.log(JSON.stringify(await verifyArchive(args[1]), null, 2)); return; }
  const selected = args[0] === "--package" ? packageRegistry.filter((entry) => entry.name === args[1]) : packagesInScope("publish");
  invariant(selected.length > 0, "No publication package selected");
  const scratch = await mkdtemp(join(tmpdir(), "reflex-artifacts-"));
  const scratchRelative = relative(resolve(tmpdir()), resolve(scratch));
  invariant(scratchRelative.startsWith("reflex-artifacts-") && !scratchRelative.includes("/") && !scratchRelative.includes("\\"), "Unexpected artifact scratch directory");
  try {
    const results = [];
    for (const entry of selected) {
      const destination = join(scratch, entry.name.replace(/[@/]/g, "-"));
      // pnpm honors publishConfig.directory and rewrites workspace protocols.
      await runPnpm(["pack", "--pack-destination", destination], { cwd: resolve(repoRoot, entry.path) });
      const archives = (await readdir(destination)).filter((name) => name.endsWith(".tgz"));
      invariant(archives.length === 1, "Expected one archive for " + entry.name);
      results.push(await verifyArchive(join(destination, archives[0]), { expectedName: entry.name }));
    }
    console.log(JSON.stringify({ schemaVersion: 1, packages: results }, null, 2));
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
