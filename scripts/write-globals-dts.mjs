import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const packageDir = process.argv[2];

if (!packageDir) {
  throw new Error("Expected package directory as the first argument");
}

const distDir = join(packageDir, "dist");
const sourceGlobalsPath = join(packageDir, "src", "globals.d.ts");
const bundledTypesPath = join(packageDir, "build", "types-bundle", "index.d.ts");
const outputPath = join(distDir, "globals.d.ts");

const lines = [];

function countChar(line, char) {
  let count = 0;

  for (const symbol of line) {
    if (symbol === char) count += 1;
  }

  return count;
}

function trimEmptyLines(input) {
  const lines = [...input];

  while (lines[0] === "") lines.shift();
  while (lines[lines.length - 1] === "") lines.pop();

  return lines;
}

function normalizeGlobalLines(input) {
  const trimmed = trimEmptyLines(
    input.map((line) => line.replace(/\s+$/, "")),
  );

  const indents = trimmed
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);

  const baseIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return trimmed.map((line) => {
    const deindented = line.slice(Math.min(baseIndent, line.length));
    return deindented.replace(/^declare\s+/, "");
  });
}

function extractGlobalBlocks(source) {
  const sourceLines = source.split(/\r?\n/);
  const globalBlocks = [];
  const remainder = [];
  let activeBlock = null;
  let depth = 0;

  for (const line of sourceLines) {
    const trimmed = line.trim();

    if (activeBlock === null) {
      if (trimmed.startsWith("declare global")) {
        activeBlock = [];
        depth = countChar(line, "{") - countChar(line, "}");
        continue;
      }

      remainder.push(line);
      continue;
    }

    const nextDepth = depth + countChar(line, "{") - countChar(line, "}");

    if (!(nextDepth === 0 && trimmed === "}")) {
      activeBlock.push(line);
    }

    depth = nextDepth;

    if (depth === 0) {
      globalBlocks.push(normalizeGlobalLines(activeBlock));
      activeBlock = null;
    }
  }

  if (activeBlock !== null) {
    throw new Error("Unterminated declare global block");
  }

  return {
    globalBlocks,
    remainder: remainder.join("\n").trim(),
  };
}

function pushGlobalBlock(blocks) {
  const merged = [];

  for (const block of blocks) {
    if (block.length === 0) continue;
    if (merged.length > 0) merged.push("");
    merged.push(...block);
  }

  if (merged.length === 0) return;

  lines.push("declare global {");

  for (const line of merged) {
    lines.push(line.length > 0 ? `  ${line}` : "");
  }

  lines.push("}");
  lines.push("");
}

let sourceGlobalLines = [];
const bundledGlobalBlocks = [];
let bundledModuleText = "";

if (existsSync(sourceGlobalsPath)) {
  const source = readFileSync(sourceGlobalsPath, "utf8");
  sourceGlobalLines = normalizeGlobalLines(source.split(/\r?\n/));
}

if (existsSync(bundledTypesPath)) {
  const bundled = readFileSync(bundledTypesPath, "utf8");
  const extracted = extractGlobalBlocks(bundled);

  bundledGlobalBlocks.push(...extracted.globalBlocks);
  bundledModuleText = extracted.remainder;
} else {
  bundledModuleText = 'export * from "./esm/index.js";';
}

const runtimeDevMarker = "const __DEV__: boolean;";

if (bundledGlobalBlocks.some((block) => block.includes(runtimeDevMarker))) {
  sourceGlobalLines = sourceGlobalLines.filter((line) => line !== runtimeDevMarker);
}

pushGlobalBlock([sourceGlobalLines, ...bundledGlobalBlocks]);

if (bundledModuleText.length > 0) {
  lines.push(bundledModuleText);
  lines.push("");
}

mkdirSync(distDir, { recursive: true });
writeFileSync(outputPath, lines.join("\n"));
