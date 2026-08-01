import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(file) {
  return readFileSync(path.join(packageRoot, file), "utf8");
}

function collect(directory, files = []) {
  for (const entry of readdirSync(path.join(packageRoot, directory), {
    withFileTypes: true,
  })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative, files);
    else if (entry.name.endsWith(".ts")) files.push(relative);
  }
  return files;
}

for (const file of collect("src")) {
  const source = read(file).replace(
    /import\s+type[\s\S]*?from\s+["'][^"']+["'];/g,
    "",
  );
  for (const line of source.split(/\r?\n/)) {
    for (const forbidden of [
      "../mcp",
      "./mcp",
      'from "../debug/tool-catalog',
      "from '../debug/tool-catalog",
      "tool-catalog",
      "@modelcontextprotocol/",
      'from "zod',
      "WeakRef",
    ]) {
      if (line.includes(forbidden)) {
        failures.push(`core source ${file} contains forbidden reference: ${forbidden}`);
      }
    }
  }
}

for (const file of ["dist/esm/index.js", "dist/cjs/index.cjs"]) {
  const artifact = read(file);
  for (const forbidden of [
    "@modelcontextprotocol",
    "diagnostics",
    "WeakRef",
    "recordDebugEvent",
    "profileRuntimeCounter",
  ]) {
    if (artifact.includes(forbidden)) {
      failures.push(`production artifact ${file} contains: ${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Architecture contract failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write("Architecture contract passed.\n");
