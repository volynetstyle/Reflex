/**
 * Vite plugin implementations for the Reflex Vite plugin
 */

import type { Plugin } from "vite";
import type {
  ReflexDOMTransformOptions,
  ReflexPluginOptions,
} from "./types";
import {
  normalizeDOMPluginOptions,
  createJSXEsbuildOptions,
} from "./normalize-options";
import { transformReflexDOMJSX } from "./transform";

/**
 * Creates the Reflex DOM JSX reactive props Vite plugin
 * @param options - The DOM transform options
 * @returns The Vite plugin
 */
export function reflexDOMVitePlugin(
  options: ReflexDOMTransformOptions = {},
): Plugin {
  return {
    name: "reflex-dom-jsx-reactive-props",
    enforce: "pre",
    transform(code, id) {
      return transformReflexDOMJSX(code, id, options);
    },
  };
}

/**
 * Creates the Reflex JSX Vite plugin for esbuild configuration
 * @param options - The plugin options
 * @returns The Vite plugin
 */
export function reflexJSXVitePlugin(options: ReflexPluginOptions = {}): Plugin {
  return {
    name: "reflex-jsx",
    config() {
      return {
        esbuild: createJSXEsbuildOptions(
          options.jsxRuntime,
          options.jsxImportSource,
        ),
      };
    },
  };
}

/**
 * Creates the main Reflex Vite plugin
 * @param options - The plugin options
 * @returns An array of Vite plugins
 */
export function reflex(options: ReflexPluginOptions = {}): Plugin[] {
  const plugins: Plugin[] = [];
  const domOptions = normalizeDOMPluginOptions(options.dom);

  if (domOptions !== null) {
    plugins.push(reflexDOMVitePlugin(domOptions));
  }

  plugins.push(reflexJSXVitePlugin(options));

  return plugins;
}
