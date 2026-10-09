/**
 * Main transformation logic for Reflex DOM JSX
 */

import type { Program } from "@swc/core";
import type {
  ReflexDOMTransformOptions,
  ReflexDOMTransformResult,
} from "./types.js";
import { normalizeDOMOptions } from "./normalize-options.js";
import {
  hasPotentialReactiveJSXExpression,
  stripQueryAndHash,
} from "./string-utils.js";
import { parseJSXModule, printProgram } from "./parser.js";
import { ReflexDOMJSXReactivePropsVisitor } from "./visitor.js";
import { injectModelValueReadImport } from "./ast-utils.js";

/**
 * Transforms Reflex DOM JSX code
 * @param code - The source code
 * @param id - The module ID
 * @param rawOptions - The transform options
 * @returns The transform result or null if no transformation needed
 */
export function transformReflexDOMJSX(
  code: string,
  id: string,
  rawOptions: ReflexDOMTransformOptions = {},
): ReflexDOMTransformResult | null {
  const options = normalizeDOMOptions(rawOptions);

  return transformWithOptions(code, id, options);
}

/** Creates a transformer with its file filter normalized once for a Vite plugin. */
export function createReflexDOMJSXTransformer(
  rawOptions: ReflexDOMTransformOptions = {},
): (code: string, id: string) => ReflexDOMTransformResult | null {
  const options = normalizeDOMOptions(rawOptions);

  return (code, id) => transformWithOptions(code, id, options);
}

function transformWithOptions(
  code: string,
  id: string,
  options: ReturnType<typeof normalizeDOMOptions>,
): ReflexDOMTransformResult | null {
  const cleanId = stripQueryAndHash(id);

  if (!options.filter(cleanId)) {
    return null;
  }

  if (!hasPotentialReactiveJSXExpression(code, options.reactiveProps)) {
    return null;
  }

  const ast = parseJSXModule(code, cleanId);
  const visitor = new ReflexDOMJSXReactivePropsVisitor(
    new Set(options.reactiveProps),
    options.model,
  );
  let transformed = visitor.visitProgram(ast) as Program;

  if (options.model !== null && visitor.shouldInjectModelValueReadHelper()) {
    transformed = injectModelValueReadImport(transformed, options.model);
  }

  return printProgram(transformed, cleanId);
}
