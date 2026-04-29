import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageDir = process.argv[2];

if (!packageDir) {
  throw new Error("Expected package directory as the first argument");
}

for (const subpath of ["unstable", "debug"]) {
  const bundledPath = join(
    packageDir,
    "build",
    "types-bundle",
    subpath,
    "index.d.ts",
  );

  if (!existsSync(bundledPath)) continue;

  const outputDir = join(packageDir, "dist", subpath);
  const outputPath = join(outputDir, "index.d.ts");
  const source = readFileSync(bundledPath, "utf8").trim();
  const lines = ['/// <reference path="../globals.d.ts" />', ""];

  if (source.length > 0) {
    lines.push(source);
    lines.push("");
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, lines.join("\n"));
}
