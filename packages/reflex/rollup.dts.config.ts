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
];

function createConfig(entry: DtsEntry): RollupOptions {
  return {
    input: entry.input,
    output: {
      file: entry.output,
      format: "es",
    },
    plugins: [
      dts({
        includeExternal: ["@reflex/runtime"],
      }),
    ],
  };
}

export default ENTRIES.map(createConfig);
