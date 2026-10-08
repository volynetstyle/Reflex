import { generateDeclarations } from "../tooling/build/declarations.mjs";

generateDeclarations({
  packageDir: process.argv[2],
  output: "globals.d.ts",
  fallbackExport: "./esm/index.js",
});
