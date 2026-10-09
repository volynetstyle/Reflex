import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const targetDir = process.argv[2];

if (!targetDir) {
  throw new Error("Usage: node scripts/fix-esm-specifiers.mjs <dir>");
}

const fileExtensions = new Set([".js", ".d.ts"]);

function hasKnownExtension(specifier) {
  return (
    specifier.endsWith(".js") ||
    specifier.endsWith(".mjs") ||
    specifier.endsWith(".cjs") ||
    specifier.endsWith(".json")
  );
}

function resolveRuntimeSpecifier(filePath, specifier) {
  const resolvedPath = join(dirname(filePath), specifier);
  const extension = filePath.endsWith(".d.ts") ? ".d.ts" : ".js";
  const fileCandidate = `${resolvedPath}${extension}`;

  try {
    if (statSync(fileCandidate).isFile()) {
      return specifier.endsWith(".js") ? specifier : `${specifier}.js`;
    }
  } catch {
    // Try the next file or directory layout.
  }

  if (specifier.endsWith("/index.js")) {
    const collapsedSpecifier = specifier.slice(0, -"/index.js".length);
    const collapsedPath = join(dirname(filePath), `${collapsedSpecifier}.js`);

    try {
      if (statSync(collapsedPath).isFile()) {
        return `${collapsedSpecifier}.js`;
      }
    } catch {
      // Try the next file or directory layout.
    }
  }

  if (specifier.endsWith(".js")) {
    const baseSpecifier = specifier.slice(0, -".js".length);
    const directoryCandidate = join(dirname(filePath), baseSpecifier);

    try {
      if (statSync(directoryCandidate).isDirectory()) {
        return `${baseSpecifier}/index.js`;
      }
    } catch {
      // Try the next file or directory layout.
    }
  }

  try {
    if (statSync(resolvedPath).isDirectory()) {
      return `${specifier}/index.js`;
    }
  } catch {
    // Try the next file or directory layout.
  }

  return `${specifier}.js`;
}

function rewriteRelativeSpecifiers(filePath, source) {
  const replacers = [
    /(import\s*["'])(\.{1,2}\/[^"']+?)(["'])/g,
    /(from\s*["'])(\.{1,2}\/[^"']+?)(["'])/g,
    /(import\s*\(\s*["'])(\.{1,2}\/[^"']+?)(["'])/g,
  ];

  let next = source;

  for (const pattern of replacers) {
    next = next.replace(pattern, (match, prefix, specifier, suffix) => {
      if (hasKnownExtension(specifier)) {
        return match;
      }

      const nextSpecifier = resolveRuntimeSpecifier(filePath, specifier);
      return `${prefix}${nextSpecifier}${suffix}`;
    });
  }

  return next;
}

function visit(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      visit(fullPath);
      continue;
    }

    if (![...fileExtensions].some((ext) => entry.endsWith(ext))) {
      continue;
    }

    const original = readFileSync(fullPath, "utf8");
    const updated = rewriteRelativeSpecifiers(fullPath, original);

    if (updated !== original) {
      writeFileSync(fullPath, updated);
    }
  }
}

visit(targetDir);
