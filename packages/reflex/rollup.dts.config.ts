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
    // Inline workspace package declarations so dist types have no dependencies.
    plugins: [dts({ respectExternal: true, tsconfig: "tsconfig.json" })],
  };
}

export default ENTRIES.map(createConfig);
