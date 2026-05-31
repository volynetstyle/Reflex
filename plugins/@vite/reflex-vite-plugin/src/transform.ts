/**
 * Main transformation logic for Reflex DOM JSX
 */

import type { Program } from "@swc/core";
import type {
  ReflexDOMTransformOptions,
  ReflexDOMTransformResult,
} from "./types.js";
import { normalizeDOMOptions } from "./normalize-options.js";
import { shouldProcessFile, hasPotentialReactiveJSXExpression } from "./string-utils.js";
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

  if (!shouldProcessFile(id, options.include, options.exclude)) {
    return null;
  }

  if (!hasPotentialReactiveJSXExpression(code, options.reactiveProps)) {
    return null;
  }

  const ast = parseJSXModule(code, id);
  const visitor = new ReflexDOMJSXReactivePropsVisitor(
    new Set(options.reactiveProps),
    options.model,
  );
  let transformed = visitor.visitProgram(ast) as Program;

  if (
    options.model !== null &&
    visitor.shouldInjectModelValueReadHelper()
  ) {
    transformed = injectModelValueReadImport(transformed, options.model);
  }

  return printProgram(transformed, id);
}
