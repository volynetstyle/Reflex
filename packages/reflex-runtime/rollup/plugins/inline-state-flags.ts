import { readFileSync } from "node:fs";
import type { Plugin } from "rollup";
import {
  inlineStateFlags,
  readStateFlags,
} from "../inline-state-flags.ts";

const META = new URL("../../src/kernel/shape/meta.ts", import.meta.url);

/** Inlines node state flags into every module that imports them. */
export function createInlineStateFlagsPlugin(): Plugin {
  const flags = readStateFlags(readFileSync(META, "utf8"));
  let replaced = 0;
  return {
    name: "reflex-inline-state-flags",
    buildStart() {
      replaced = 0;
    },
    transform(code, id) {
      if (id.includes("node_modules") || !/\.[cm]?js$/.test(id)) return null;
      const result = inlineStateFlags(code, id, flags);
      if (result === null) return null;
      replaced += result.replaced;
      return { code: result.code, map: null };
    },
    buildEnd(error) {
      // A silent no-op would ship the slow form again; refuse instead.
      if (!error && replaced === 0)
        this.error("inline-state-flags: no state flag reference was inlined");
    },
  };
}
