import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import swc from "@rollup/plugin-swc";
import replace from "@rollup/plugin-replace";
import { dts } from "rollup-plugin-dts";
import { createRequire, builtinModules } from "node:module";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "dist");
if (dirname(output) !== root || !output.endsWith(sep + "dist"))
  throw new Error("Unsafe build output");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
const wasmJs = require.resolve("@swc/wasm");
const wasmDirectory = dirname(wasmJs);
const entries = {
  index: "src/index.ts",
  advanced: "src/advanced.ts",
  store: "src/store/index.ts",
  "compiled-store": "src/store/index.ts",
  "selectors/index": "src/selectors/index.ts",
  "selectors/shared": "src/selectors/shared.ts",
  vite: "src/vite.ts",
  runtime: "src/runtime.ts",
  "runtime/internal": "src/runtime/internal.ts",
  "runtime/core": "src/runtime/core.ts",
};
const input = Object.fromEntries(
  Object.entries(entries).map(([name, file]) => [name, resolve(root, file)]),
);
function portableWasm() {
  return {
    name: "portable-swc-asset",
    transform(code, id) {
      if (id !== wasmJs) return null;
      const needle = "require('path').join(__dirname, 'wasm_bg.wasm')";
      if (!code.includes(needle))
        throw new Error("SWC WASM loader layout changed");
      return code.replace(
        needle,
        "new URL('../compiler/swc.wasm', import.meta.url)",
      );
    },
  };
}
const external = (id) =>
  id.startsWith("node:") ||
  builtinModules.includes(id) ||
  [
    "@volynets/reflex-framework",
    "@volynets/reflex-runtime",
    "@volynets/reflex-scheduler",
  ].some((name) => id === name || id.startsWith(name + "/"));
const onwarn = (warning) => {
  if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
  if (
    !["CIRCULAR_DEPENDENCY", "EMPTY_BUNDLE", "THIS_IS_UNDEFINED"].includes(
      warning.code,
    )
  )
    process.stderr.write(warning.message + "\n");
};
const bundle = await rollup({
  input,
  external,
  onwarn,
  plugins: [
    portableWasm(),
    nodeResolve({
      extensions: [".ts", ".js", ".mjs", ".json"],
      preferBuiltins: true,
    }),
    replace({
      preventAssignment: true,
      values: {
        __DEV__: "false",
        __PROFILE__: "false",
        __TEST__: "false",
        __PROD__: "true",
        __TRACKING_ONE_HOP__: "true",
        __TRACKING_TWO_HOP__: "true",
        __TRACKING_LAST_EDGE__: "true",
      },
    }),
    swc({
      swc: {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        sourceMaps: false,
      },
    }),
    commonjs(),
  ],
});
await bundle.write({
  dir: output,
  format: "esm",
  entryFileNames: "[name].js",
  chunkFileNames: "chunks/[name]-[hash].js",
  manualChunks(id) {
    if (id.includes("@swc/wasm")) return "swc";
  },
});
await bundle.close();
mkdirSync(join(output, "compiler"), { recursive: true });
copyFileSync(
  join(wasmDirectory, "wasm_bg.wasm"),
  join(output, "compiler/swc.wasm"),
);

const typesBundle = await rollup({
  input,
  external,
  onwarn,
  plugins: [
    dts({
      tsconfig: resolve(root, "tsconfig.json"),
      respectExternal: true,
      compilerOptions: {
        composite: false,
        incremental: false,
        declarationMap: false,
      },
    }),
  ],
});
await typesBundle.write({
  dir: output,
  format: "esm",
  entryFileNames: "[name].d.ts",
  chunkFileNames: "types/[name]-[hash].d.ts",
});
await typesBundle.close();

function declarations(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? declarations(join(directory, entry.name))
      : entry.name.endsWith(".d.ts")
        ? [join(directory, entry.name)]
        : [],
  );
}
for (const file of declarations(output)) {
  const code = readFileSync(file, "utf8");
  writeFileSync(file, '/// <reference lib="esnext.disposable" />\n' + code);
}
mkdirSync(join(output, "licenses"), { recursive: true });
copyFileSync(
  resolve(root, "licenses/SWC-APACHE-2.0.txt"),
  join(output, "licenses/SWC-APACHE-2.0.txt"),
);
writeFileSync(
  join(output, "licenses/NOTICE.txt"),
  "Includes SWC WebAssembly (Apache-2.0). Reflex host and runtime are shared peer dependencies.\n",
);
process.stdout.write(
  "Built library, portable compiler, plugin and declarations with shared runtime imports.\n",
);
