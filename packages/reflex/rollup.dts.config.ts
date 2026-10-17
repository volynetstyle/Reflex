import { dts } from "rollup-plugin-dts";
import type { RollupOptions } from "rollup";

interface DtsEntry {
  input: string;
  output: string;
}

const ENTRIES: ReadonlyArray<DtsEntry> = [
  {
    input: "build/types/index.d.ts",
    output: "build/types-bundle/index.d.ts",
  },
  {
    input: "build/types/unstable/index.d.ts",
    output: "build/types-bundle/unstable/index.d.ts",
  },
  {
    input: "build/types/debug/index.d.ts",
    output: "build/types-bundle/debug/index.d.ts",
  },
];

function createConfig(entry: DtsEntry): RollupOptions {
  return {
    input: entry.input,
    output: {
      file: entry.output,
      format: "es",
    },
    // Runtime declarations stay imports of the peer package, so types such as
    // Runtime and nodes keep one identity across the facade and extensions.
    // Scheduler declarations are inlined along with its code.
    external: (id) =>
      id === "@volynets/reflex-runtime" ||
      id.startsWith("@volynets/reflex-runtime/"),
    plugins: [dts({ respectExternal: true, tsconfig: "tsconfig.json" })],
  };
}

export default ENTRIES.map(createConfig);
