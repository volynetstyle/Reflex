// Builds the benchmark apps with Vite into `.build/<framework>/`.
//
// Every app goes through the same production pipeline (esbuild minification,
// ES2022, no module preload polyfill), so bundling differences do not leak
// into the comparison. Reflex is consumed from the package's standalone
// distribution, i.e. what an application ships.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const benchRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(benchRoot, "../..");
const standaloneDist = join(packageRoot, "dist/standalone");

export const buildRoot = join(benchRoot, ".build");

/** Frameworks available to the harness, keyed by directory name. */
export const frameworks = {
  vanillajs: {
    label: "vanillajs",
    vite: {},
  },
  "reflex-dom": {
    label: "reflex-dom",
    vite: {
      esbuild: {
        jsx: "automatic",
        jsxImportSource: "@volynets/reflex-dom/standalone",
      },
      resolve: {
        alias: [
          {
            find: /^@volynets\/reflex-dom\/standalone\/jsx-runtime$/,
            replacement: join(standaloneDist, "jsx-runtime.js"),
          },
          {
            find: /^@volynets\/reflex-dom\/standalone\/jsx-dev-runtime$/,
            replacement: join(standaloneDist, "jsx-dev-runtime.js"),
          },
          {
            find: /^@volynets\/reflex-dom\/standalone$/,
            replacement: join(standaloneDist, "index.js"),
          },
        ],
      },
    },
    requires: [join(standaloneDist, "index.js")],
    missingHint:
      "Build the package first: pnpm --filter @volynets/reflex-dom build",
  },
};

export async function buildApps(names) {
  for (const name of names) {
    const framework = frameworks[name];
    if (framework === undefined) {
      throw new Error(`Unknown framework "${name}".`);
    }

    for (const required of framework.requires ?? []) {
      if (!existsSync(required)) {
        throw new Error(`${required} is missing. ${framework.missingHint}`);
      }
    }

    await build({
      configFile: false,
      root: join(benchRoot, "apps", name),
      base: "./",
      logLevel: "warn",
      mode: "production",
      ...framework.vite,
      build: {
        outDir: join(buildRoot, name),
        emptyOutDir: true,
        minify: "esbuild",
        target: "es2022",
        modulePreload: false,
        reportCompressedSize: false,
      },
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2);
  await buildApps(names.length > 0 ? names : Object.keys(frameworks));
}
