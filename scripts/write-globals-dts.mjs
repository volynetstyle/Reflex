import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const packageDir = process.argv[2];

if (!packageDir) {
  throw new Error("Expected package directory as the first argument");
}

const distDir = join(packageDir, "dist");
const sourceGlobalsPath = join(packageDir, "src", "globals.d.ts");
const outputPath = join(distDir, "globals.d.ts");

const lines = [];

if (existsSync(sourceGlobalsPath)) {
  const source = readFileSync(sourceGlobalsPath, "utf8").trim();

  if (source.length > 0) {
    lines.push("declare global {");

    for (const line of source.split(/\r?\n/)) {
      lines.push(line.length > 0 ? `  ${line}` : "");
    }

    lines.push("}");
    lines.push("");
  }
}

lines.push('export * from "./esm/index.js";');
lines.push("");

mkdirSync(distDir, { recursive: true });
writeFileSync(outputPath, lines.join("\n"));
