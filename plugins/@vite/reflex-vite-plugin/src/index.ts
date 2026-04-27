/**
 * @reflex/vite-plugin
 * Main entry point for the Reflex Vite plugin
 *
 * This plugin provides:
 * - JSX transformation for automatic runtime
 * - Reactive props handling for computed dependencies
 * - Model value tracking and optimization
 */

// Re-export types
export type {
  ReflexDOMTransformOptions,
  ReflexDOMTransformResult,
  ReflexModelTransformOptions,
  NormalizedReflexModelTransformOptions,
  NormalizedDOMTransformOptions,
  ReflexPluginOptions,
  SelectorType,
} from "./types";

// Re-export the main transformation function
export { transformReflexDOMJSX } from "./transform";

// Re-export plugin creators
export {
  reflexDOMVitePlugin,
  reflexJSXVitePlugin,
  reflex,
} from "./vite-plugins";

// Default export
export { reflex as default } from "./vite-plugins";
