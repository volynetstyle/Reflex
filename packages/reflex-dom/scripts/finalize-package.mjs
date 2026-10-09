import { copyFile, cp, readFile, rm, writeFile } from "node:fs/promises";

const packageRoot = new URL("../", import.meta.url);
const dist = new URL("dist/", packageRoot);
const source = JSON.parse(
  await readFile(new URL("package.json", packageRoot), "utf8"),
);

// Publish only public metadata. Build tooling and workspace dependencies stay local.
const fields = [
  "name",
  "version",
  "type",
  "description",
  "license",
  "author",
  "sideEffects",
  "keywords",
  "repository",
  "homepage",
  "bugs",
  "engines",
  "peerDependencies",
];
const manifest = Object.fromEntries(
  fields
    .filter((field) => field in source)
    .map((field) => [field, source[field]]),
);
manifest.main = "./index.js";
manifest.types = "./index.d.ts";
manifest.exports = Object.fromEntries(
  Object.entries(source.exports).map(([subpath, entry]) => [
    subpath,
    {
      types: entry.types.replace("./dist/", "./"),
      import: entry.import.replace("./dist/", "./"),
    },
  ]),
);
manifest.files = [
  "*.js",
  "*.d.ts",
  "chunks",
  "standalone",
  "README.md",
  "LICENSE",
];
manifest.publishConfig = { access: source.publishConfig.access };

await rm(dist, { recursive: true, force: true });
await cp(new URL("build/bundle/", packageRoot), dist, { recursive: true });
await writeFile(
  new URL("package.json", dist),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await copyFile(new URL("README.md", packageRoot), new URL("README.md", dist));
await copyFile(new URL("../../LICENSE", packageRoot), new URL("LICENSE", dist));
