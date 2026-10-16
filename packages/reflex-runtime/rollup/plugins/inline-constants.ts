import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "rollup";
import {
  collectConstants,
  inlineConstants,
  type Defines,
  type SourceFile,
} from "../inline-constants.ts";

const SOURCES = fileURLToPath(new URL("../../src", import.meta.url));

/** Reads every runtime source module (the constant declarations). */
export function readRuntimeSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const file = path.join(dir, entry);
      if (statSync(file).isDirectory()) walk(file);
      else if (file.endsWith(".ts") && !file.endsWith(".d.ts"))
        files.push({ path: file, code: readFileSync(file, "utf8") });
    }
  };
  walk(root);
  return files;
}

/** Inlines compile-time constants into every module that references them. */
export function createInlineConstantsPlugin(defines: Defines): Plugin {
  const table = collectConstants(readRuntimeSources(SOURCES), defines);
  let replaced = 0;
  return {
    name: "reflex-inline-constants",
    buildStart() {
      replaced = 0;
    },
    transform(code, id) {
      if (id.includes("node_modules") || !/\.[cm]?js$/.test(id)) return null;
      const result = inlineConstants(code, id, table);
      if (result === null) return null;
      replaced += result.replaced;
      return { code: result.code, map: null };
    },
    buildEnd(error) {
      // A silent no-op would ship the slow form again; refuse instead.
      if (!error && replaced === 0)
        this.error("inline-constants: no constant reference was inlined");
    },
  };
}
