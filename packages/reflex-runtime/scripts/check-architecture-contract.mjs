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
    else files.push(relative);
  }
  return files;
}

for (const file of collect("src").filter((file) => file.endsWith(".ts"))) {
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
        failures.push(
          `core source ${file} contains forbidden reference: ${forbidden}`,
        );
      }
    }
  }
}

// Execution domains (docs/architecture/execution-domains.md, H1).
// Node and edge shapes are frozen: domains are a boundary, never node data.
const NODE_FIELDS = [
  "state",
  "firstOut",
  "lastOut",
  "firstIn",
  "lastIn",
  "tailIn",
  "compute",
  "payload",
];
const EDGE_FIELDS = [
  "stamp",
  "from",
  "to",
  "prevOut",
  "nextOut",
  "prevIn",
  "nextIn",
];

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function expectFields(label, actual, expected) {
  if (actual.join(",") !== expected.join(",")) {
    failures.push(
      `${label} changed: expected [${expected.join(", ")}], found [${actual.join(", ")}]`,
    );
  }
}

{
  const node = stripComments(read("src/kernel/shape/node.ts"));
  const body = /class ReactiveNode[^{]*\{([\s\S]*?)\n\s*constructor\(/.exec(
    node,
  );
  if (body === null) failures.push("ReactiveNode class body not found");
  else {
    const fields = [...body[1].matchAll(/^\s+(\w+)\s*[:=;]/gm)].map(
      (match) => match[1],
    );
    expectFields("ReactiveNode fields", fields, NODE_FIELDS);
  }

  const edge = stripComments(read("src/kernel/shape/edge.ts"));
  const declaration = /interface ReactiveEdge\s*\{([\s\S]*?)\}/.exec(edge);
  const literal = /=>\s*\(\{([\s\S]*?)\}\)/.exec(edge);
  if (declaration === null || literal === null) {
    failures.push("ReactiveEdge declaration or factory not found");
  } else {
    expectFields(
      "ReactiveEdge interface",
      [...declaration[1].matchAll(/^\s+(\w+)\s*:/gm)].map((m) => m[1]),
      EDGE_FIELDS,
    );
    expectFields(
      "createReactiveEdge literal",
      [...literal[1].matchAll(/^\s+(\w+)\s*[:,]/gm)].map((m) => m[1]),
      EDGE_FIELDS,
    );
  }
}

const HOT_PATH = [
  "src/protocol/read.producer.ts",
  "src/protocol/read.consumer.ts",
  "src/protocol/write.producer.ts",
  "src/protocol/watcher.ts",
  ...collect("src/kernel/shape/tracking"),
  ...collect("src/kernel/shape/graph"),
  ...collect("src/kernel/stages"),
  ...collect("src/kernel/engine"),
  "src/kernel/state.ts",
].filter((file) => file.endsWith(".ts"));
const HOT_PATH_FORBIDDEN =
  /\b(?:ExecutionDomain\w*|getExecutionDomain|domain|WeakMap|getActiveRuntimeContext|activeRuntimeContext|OwnershipNode|OwnerContext)\b/;

for (const file of HOT_PATH) {
  const source = stripComments(read(file)).replace(
    /import\s+type[\s\S]*?from\s+["'][^"']+["'];/g,
    "",
  );
  const match = HOT_PATH_FORBIDDEN.exec(source);
  if (match !== null) {
    failures.push(`hot path ${file} references domain machinery: ${match[0]}`);
  }
}

for (const file of [...collect("src/kernel"), ...collect("src/protocol")]) {
  if (!file.endsWith(".ts")) continue;
  if (/from\s+["'][^"']*\/domain(?:\/[^"']*)?["']/.test(read(file))) {
    failures.push(`kernel source ${file} imports the domain layer`);
  }
}

for (const file of [...collect("dist/esm"), ...collect("dist/cjs")].filter(
  (file) => /\.(?:js|cjs)$/.test(file),
)) {
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
