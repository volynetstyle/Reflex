import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fingerprint, sha256, options, required, writeJson } from "./io.mjs";
const require = createRequire(import.meta.url);
const inside = (root, path) => { const r = relative(root, path); return r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r); };
const slash = path => path.replaceAll("\\", "/");
const defaultSubject = path => /^packages\/[^/]+\/(src|build|dist)\//.test(path);

// Use the compiler resolver for relative imports and aliases, then recursively
// inspect local helpers/configs. Subject implementation is deliberately excluded
// from the workload fingerprint and recorded as a dependency boundary instead.
export function protocolManifest(root, entries, { subjects = defaultSubject } = {}) {
  const ts = require("typescript"), base = realpathSync(root), visited = new Set(), files = [], subjectImports = new Set(), externalImports = new Set();
  function visit(input) {
    const path = realpathSync(resolve(base, input));
    if (!inside(base, path)) throw new Error("Protocol file escapes root: " + input);
    const rel = slash(relative(base, path));
    if (subjects(rel)) { subjectImports.add(rel); return; }
    if (visited.has(path)) return; visited.add(path);
    const bytes = readFileSync(path); files.push({ path: rel, bytes: bytes.length, sha256: sha256(bytes) });
    if (path.endsWith(".json")) {
      const json = ts.parseConfigFileTextToJson(path, bytes.toString("utf8"));
      if (json.error) throw new Error("Invalid protocol JSON: " + rel);
      const spec = json.config;
      for (const entry of [spec.extends, ...(spec.references ?? []).map(r => r.path)].filter(Boolean)) {
        if (!entry.startsWith(".")) { externalImports.add(entry); continue; }
        const target = resolve(dirname(path), entry);
        visit(existsSync(target) && extname(target) ? target : resolve(target, "tsconfig.json"));
      }
      return;
    }
    const configPath = ts.findConfigFile(dirname(path), existsSync);
    let compiler = {};
    if (configPath) {
      const config = ts.readConfigFile(configPath, p => readFileSync(p, "utf8"));
      if (config.error) throw new Error("Cannot read tsconfig: " + configPath);
      compiler = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath)).options;
      visit(configPath);
    }
    const source = ts.createSourceFile(path, bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
    const imports = [];
    function inspect(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) throw new Error("Dynamic protocol import must be explicitly pinned: " + rel);
        imports.push(node.arguments[0].text);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
    for (const specifier of imports) {
      if (specifier.startsWith("node:")) continue;
      const target = ts.resolveModuleName(specifier, path, { allowJs: true, ...compiler }, ts.sys).resolvedModule;
      const resolvedTarget = target ? realpathSync(target.resolvedFileName) : null;
      if (resolvedTarget && inside(base, resolvedTarget) && !slash(relative(base, resolvedTarget)).split("/").includes("node_modules")) visit(resolvedTarget);
      else if (specifier.startsWith(".")) throw new Error("Unresolved local protocol dependency: " + rel + " -> " + specifier);
      else {
        const aliasMatches = Object.keys(compiler.paths ?? {}).some(alias => alias.includes("*") ? specifier.startsWith(alias.split("*")[0]) && specifier.endsWith(alias.split("*")[1]) : specifier === alias);
        if (aliasMatches && !target) throw new Error("migration-required: unresolved configured protocol alias " + rel + " -> " + specifier);
        externalImports.add(specifier);
      }
    }
  }
  for (const entry of entries) visit(entry);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const protocol = { schemaVersion: 1, resolverVersion: ts.version, entries: [...entries].map(slash).sort(), files, subjectBoundaries: [...subjectImports].sort(), externalSpecifiers: [...externalImports].sort(), policy: "transitive static local imports + tsconfig chain; subject implementation excluded; provider versions checked independently" };
  return { ...protocol, protocolHash: fingerprint(protocol) };
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--root", "--base-root", "--head-root", "--entries", "--json"]);
  const entries = required(opts, "entries").split(",").filter(Boolean);
  if (!entries.length) throw new Error("Empty protocol entry set");
  let result;
  if (opts["base-root"] || opts["head-root"]) {
    const base = protocolManifest(required(opts, "base-root"), entries), head = protocolManifest(required(opts, "head-root"), entries);
    if (base.protocolHash !== head.protocolHash) throw new Error("Transitive benchmark protocol changed. Migrate/rebase the cohort explicitly; do not compare changed workloads.");
    result = { ...head, compatible: true };
  } else result = protocolManifest(opts.root ?? process.cwd(), entries);
  if (opts.json) writeJson(opts.json, result);
  console.log(result.protocolHash);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
