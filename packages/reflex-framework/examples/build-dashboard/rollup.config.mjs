import swc from "@rollup/plugin-swc";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  input: "src/main.tsx",
  output: {
    file: "dist/script.js",
    format: "esm",
    sourcemap: false,
  },
  external: [/^node:/],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
  },
  plugins: [
    nodeResolve({
      exportConditions: ["source", "node", "import"],
      extensions: [".ts", ".tsx", ".mjs", ".js"],
    }),
    swc({
      jsc: {
        target: "es2022",
        parser: {
          syntax: "typescript",
          tsx: true,
        },
        transform: {
          react: {
            runtime: "automatic",
            importSource: "@volynets/reflex-framework",
          },
        },
      },
      minify: false,
    }),
  ],
};
