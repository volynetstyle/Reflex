/**
 * Options normalization utilities for the Reflex Vite plugin
 */

import type {
  ReflexDOMTransformOptions,
  ReflexModelTransformOptions,
  NormalizedDOMTransformOptions,
  NormalizedReflexModelTransformOptions,
} from "./types";
import {
  DEFAULT_MODEL_IMPORT_SOURCE,
  DEFAULT_MODEL_READ_HELPER,
  DEFAULT_MODEL_ROOTS,
  DEFAULT_REACTIVE_PROPS,
  DEFAULT_JSX_IMPORT_SOURCE,
} from "./types";

/**
 * Normalizes DOM transform options
 * @param options - The raw DOM transform options
 * @returns The normalized options
 */
export function normalizeDOMOptions(
  options: ReflexDOMTransformOptions = {},
): NormalizedDOMTransformOptions {
  return {
    include: options.include ?? /\.[cm]?[jt]sx(?:$|\?)/,
    exclude: options.exclude ?? /node_modules/,
    reactiveProps: options.reactiveProps ?? DEFAULT_REACTIVE_PROPS,
    model: normalizeModelOptions(options.model),
  };
}

/**
 * Normalizes model transform options
 * @param options - The raw model options
 * @returns The normalized model options or null if disabled
 */
export function normalizeModelOptions(
  options: boolean | ReflexModelTransformOptions | undefined,
): NormalizedReflexModelTransformOptions | null {
  if (options === false) {
    return null;
  }

  const normalized = options === true || options === undefined ? {} : options;

  return {
    roots: new Set(normalized.roots ?? DEFAULT_MODEL_ROOTS),
    importSource: normalized.importSource ?? DEFAULT_MODEL_IMPORT_SOURCE,
    helper: normalized.helper ?? DEFAULT_MODEL_READ_HELPER,
  };
}

/**
 * Normalizes DOM plugin options
 * @param options - The raw DOM plugin options
 * @returns The normalized options or null if disabled
 */
export function normalizeDOMPluginOptions(
  options: boolean | ReflexDOMTransformOptions | undefined,
): ReflexDOMTransformOptions | null {
  if (options === undefined || options === false) {
    return null;
  }

  return options === true ? {} : options;
}

/**
 * Creates esbuild options for JSX handling
 * @param jsxRuntime - The JSX runtime type
 * @param jsxImportSource - The JSX import source
 * @returns The esbuild options object
 */
export function createJSXEsbuildOptions(
  jsxRuntime: "classic" | "automatic" | "reflex" | "tsrx" = "automatic",
  jsxImportSource: string = DEFAULT_JSX_IMPORT_SOURCE,
) {
  if (jsxRuntime === "classic") {
    return {
      jsx: "transform" as const,
      jsxFactory: "jsx",
      jsxFragment: "Fragment",
    };
  }

  return {
    jsx: "automatic" as const,
    jsxImportSource,
  };
}
