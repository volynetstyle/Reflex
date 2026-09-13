import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import { rollup } from "rollup";

// Compile with build:ts first. Snapshots add test-only access to existing stacks;
// source modules and production exports are never changed by this script.
const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name))
  throw new Error("Usage: node scripts/snapshot-stages.mjs <name>");
const directory = resolve("temp/stages", name);
if (existsSync(directory))
  throw new Error(`Snapshot ${name} already exists; choose a new name.`);
mkdirSync(directory, { recursive: true });
const build = resolve("packages/reflex-runtime/build/esm").replaceAll(
  "\\",
  "/",
);
const entry = "\0stages-snapshot";
for (const mode of ["prod", "dev"]) {
  const dev = mode === "dev";
  const bundle = await rollup({
    input: entry,
    plugins: [
      {
        name: "stages-test-access",
        resolveId(id) {
          if (id === entry) return id;
        },
        load(id) {
          if (id !== entry) return;
          return `export * from "${build}/src/internal/index.js";
          export * from "${build}/src/profiling.js";
          export { installRuntimeDebug } from "${build}/debug/debug.runtime.js";
          export { testPullStack, testPullHigh } from "${build}/src/kernel/stages/second/pull_iterator.js";
          export { testPushStack, testPushHigh } from "${build}/src/kernel/stages/first/push_iterator.js";`;
        },
        transform(code, id) {
          const path = id.replaceAll("\\", "/");
          if (path.endsWith("/stages/second/pull_iterator.js"))
            return (
              code +
              "\nexport { stack as testPullStack, high as testPullHigh };"
            );
          if (path.endsWith("/stages/first/push_iterator.js"))
            return (
              code +
              "\nexport { propagateStack as testPushStack, propagateStackHigh as testPushHigh };"
            );
        },
      },
      nodeResolve({ extensions: [".js"] }),
      replace({
        preventAssignment: true,
        values: {
          __DEV__: String(dev),
          __PROFILE__: String(dev),
          __TEST__: "false",
          __PROD__: String(!dev),
          __TRACKING_ONE_HOP__: "true",
          __TRACKING_TWO_HOP__: "true",
          __TRACKING_LAST_EDGE__: "true",
        },
      }),
    ],
    onwarn(warning, warn) {
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    },
    treeshake: { preset: "recommended" },
  });
  await bundle.write({
    file: resolve(directory, `${mode}.mjs`),
    format: "esm",
  });
  await bundle.close();
}
const sourceRoot = resolve("packages/reflex-runtime/src/kernel/stages");
const hashes = {};
for (const file of readdirSync(sourceRoot, { recursive: true }).filter((name) =>
  name.endsWith(".ts"),
)) {
  const source = readFileSync(resolve(sourceRoot, file), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  const path = relative(sourceRoot, resolve(sourceRoot, file)).replaceAll(
    "\\",
    "/",
  );
  const destination = resolve(directory, "source", path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, source);
  hashes[path] = createHash("sha256").update(source).digest("hex");
}
writeFileSync(
  resolve(directory, "sources.json"),
  JSON.stringify(hashes, null, 2) + "\n",
);
console.log(
  `Saved ${name}: production, development and source hashes in ${directory}`,
);
