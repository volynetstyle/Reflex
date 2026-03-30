import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageDir = process.argv[2];

if (!packageDir) {
  throw new Error("Expected package directory as the first argument");
}

const bundledPath = join(
  packageDir,
  "build",
  "types-bundle",
  "unstable",
  "index.d.ts",
);
const outputDir = join(packageDir, "dist", "unstable");
const outputPath = join(outputDir, "index.d.ts");

if (!existsSync(bundledPath)) {
  process.exit(0);
}

const source = readFileSync(bundledPath, "utf8").trim();
const lines = ['/// <reference path="../globals.d.ts" />', ""];

if (source.length > 0) {
  lines.push(source);
  lines.push("");
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, lines.join("\n"));
