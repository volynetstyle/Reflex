import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");

const outputs = [
  { root: path.join(packageRoot, "build/esm"), extension: ".js" },
  { root: path.join(packageRoot, "dist/esm"), extension: ".d.ts" },
];

function collectFiles(directory, extension, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(file, extension, files);
    else if (entry.name.endsWith(extension)) files.push(file);
  }
  return files;
}

function resolveAlias(root, specifier, extension) {
  const target = path.join(root, specifier.slice("@runtime/".length));
  const fileTarget = `${target}${extension}`;
  if (existsSync(fileTarget)) return fileTarget;

  const indexTarget = path.join(target, `index${extension}`);
  if (existsSync(indexTarget)) return indexTarget;
  throw new Error(`Cannot resolve build alias: ${specifier}`);
}

for (const { root, extension } of outputs) {
  for (const file of collectFiles(root, extension)) {
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(
      /(["'])(@runtime\/[^"']+)\1/g,
      (_, quote, specifier) => {
        const target = resolveAlias(root, specifier, extension);
        let relative = path
          .relative(path.dirname(file), target)
          .replaceAll("\\", "/");
        if (extension === ".d.ts")
          relative = relative.slice(0, -extension.length);
        if (!relative.startsWith(".")) relative = `./${relative}`;
        return `${quote}${relative}${quote}`;
      },
    );
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
}
