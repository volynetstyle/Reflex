import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import swc from "@rollup/plugin-swc";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const runtimeRoot = resolvePath(packageRoot, "../../packages/reflex-runtime/src");
const schedulerRoot = resolvePath(packageRoot, "../../packages/reflex-scheduler/src");

export default {
  input: resolvePath(packageRoot, "src/instrumented/reflex-entry.ts"),
  output: { file: resolvePath(packageRoot, "dist/instrumented/reflex.mjs"), format: "esm" },
  plugins: [
    {
      name: "reflex-source-aliases",
      resolveId(source: string) {
        if (source === "@volynets/reflex-runtime/internal") return resolvePath(runtimeRoot, "internal/index.ts");
        if (source === "@volynets/reflex-runtime") return resolvePath(runtimeRoot, "internal/index.ts");
        if (source === "@volynets/reflex-scheduler") return resolvePath(schedulerRoot, "index.ts");
        if (source.startsWith("@runtime/")) {
          const target = resolvePath(runtimeRoot, source.slice("@runtime/".length));
          return existsSync(`${target}.ts`) ? `${target}.ts` : resolvePath(target, "index.ts");
        }
        return null;
      },
    },
    resolve({ extensions: [".ts", ".js"] }),
    swc(),
    replace({
      preventAssignment: true,
      values: {
        __DEV__: "false",
        __PROFILE__: "true",
        __TRACKING_ONE_HOP__: "true",
        __TRACKING_TWO_HOP__: "true",
        __TRACKING_LAST_EDGE__: "true",
        __TEST__: "false",
        __PROD__: "true",
      },
    }),
  ],
};
