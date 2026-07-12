import type { Plugin } from "rollup";

import {
  inlineRegisterReads,
  inlineRegisterWrites,
  REGISTER_MODULE_SUFFIXES,
  REGISTER_SOURCE_SUFFIX,
  STATE_IMPORT,
} from "./registerInlining/rules.ts";
import {
  validateRegisterCallSites,
  validateRegisterSource,
} from "./registerInlining/validate.ts";

/** Generic production inliner. Register-specific policy lives in rules/. */
export function inlineKernelRegistersPlugin(): Plugin {
  let sourceValidated = false;

  return {
    name: "inline-kernel-registers",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/");

      if (normalizedId.endsWith(REGISTER_SOURCE_SUFFIX)) {
        validateRegisterSource(code, normalizedId);
        sourceValidated = true;
      }

      if (!REGISTER_MODULE_SUFFIXES.some((suffix) => normalizedId.endsWith(suffix))) {
        return null;
      }

      const transformed = inlineRegisterReads(code);
      return transformed === code
        ? null
        : { code: STATE_IMPORT + transformed, map: null };
    },
    renderChunk(code, _chunk, outputOptions) {
      if (!sourceValidated) {
        this.error(`Register source ${REGISTER_SOURCE_SUFFIX} was not validated`);
      }

      const transformed = inlineRegisterWrites(code);
      // Rollup's CJS finalizer can introduce deconflicted facade calls after
      // module linking. Read rules still apply there; strict write-call
      // completeness is currently an ESM-only boundary.
      if (outputOptions.format === "es") {
        validateRegisterCallSites(transformed);
      }
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
