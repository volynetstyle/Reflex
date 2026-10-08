import { generateDeclarations } from "../tooling/build/declarations.mjs";

generateDeclarations({
  packageDir: process.argv[2],
  output: "index.d.ts",
  fallbackExport: "./esm/src/index.js",
});
