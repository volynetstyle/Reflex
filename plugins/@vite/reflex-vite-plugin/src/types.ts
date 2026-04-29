/**
 * Type definitions and constants for the Reflex Vite plugin
 */

import type { Expression } from "@swc/core";

/**
 * Options for the Reflex DOM JSX transform
 */
export interface ReflexDOMTransformOptions {
  include?: RegExp;
  exclude?: RegExp;
  reactiveProps?: readonly string[];
  model?: boolean | ReflexModelTransformOptions;
}

/**
 * Result of the Reflex DOM JSX transform
 */
export interface ReflexDOMTransformResult {
  code: string;
  map: string | null;
}

/**
 * Options for Reflex model transform
 */
export interface ReflexModelTransformOptions {
  roots?: readonly string[];
  importSource?: string;
  helper?: string;
}

/**
 * Normalized model transform options for internal use
 */
export interface NormalizedReflexModelTransformOptions {
  roots: ReadonlySet<string>;
  importSource: string;
  helper: string;
}

/**
 * Normalized DOM transform options for internal use
 */
export interface NormalizedDOMTransformOptions {
  include: RegExp;
  exclude: RegExp;
  reactiveProps: readonly string[];
  model: NormalizedReflexModelTransformOptions | null;
}

/**
 * Main options for the Reflex Vite plugin
 */
export interface ReflexPluginOptions {
  /**
   * Can be used to process extra files like `.mdx`
   * @example include: /\.(mdx|js|jsx|ts|tsx)$/
   * @default /\.[tj]sx?$/
   */
  include?: SelectorType;
  /**
   * Can be used to exclude JSX/TSX files that run in a worker or are not Reflex files.
   * Except if explicitly desired, keep node_modules in the exclude list.
   * @example exclude: [/\/pdf\//, /\.solid\.tsx$/, /\/node_modules\//]
   * @default /\/node_modules\//
   */
  exclude?: SelectorType;
  /**
   * Control where the JSX factory is imported from.
   * https://oxc.rs/docs/guide/usage/transformer/jsx.html#import-source
   * @default "@volynets/reflex-dom"
   */
  jsxImportSource?: string;
  /**
   * Note: Skipping Reflex import with classic runtime is not supported from v4.
   * @default "automatic"
   */
  jsxRuntime?: "classic" | "automatic" | "tsrx";
  /**
   * Reflex Fast Refresh runtime options.
   */
  reflex?: {
    /**
     * Reflex Fast Refresh runtime URL prefix.
     * Useful in a module federation context to enable HMR by specifying
     * the host application URL in the Vite config of a remote application.
     */
    refreshHost?: string;
  };
  /**
   * Enables the DOM JSX transform that wraps computed reactive props
   * like class/className/style into accessors.
   */
  dom?: boolean | ReflexDOMTransformOptions;
}

/**
 * Selector type for include/exclude patterns
 */
export type SelectorType = string | RegExp | Array<string | RegExp>;

/**
 * JSX attribute name type union
 */
export type JSXAttributeNameType = "Identifier" | "NamespacedName" | "JSXMemberExpression";

/**
 * Default constants for JSX import source
 */
export const DEFAULT_JSX_IMPORT_SOURCE = "@volynets/reflex-dom";

/**
 * Default constants for model import source
 */
export const DEFAULT_MODEL_IMPORT_SOURCE = "@volynets/reflex";

/**
 * Default helper function name for reading model values
 */
export const DEFAULT_MODEL_READ_HELPER = "__readReflexModelValue";

/**
 * Default model roots to check for reactive expressions
 */
export const DEFAULT_MODEL_ROOTS = ["model"] as const;

/**
 * Default reactive props that should be wrapped in accessors
 */
export const DEFAULT_REACTIVE_PROPS = ["class", "className", "style"] as const;

/**
 * Export name for the model read helper
 */
export const MODEL_READ_EXPORT = "readModelValue";

/**
 * Dummy span object for created AST nodes
 */
export const DUMMY_SPAN = { start: 0, end: 0, ctxt: 0 } as const;

/**
 * Set of expression types that can be wrapped in accessors
 */
export const WRAPPABLE_EXPRESSION_TYPES = new Set<Expression["type"]>([
  "ArrayExpression",
  "AssignmentExpression",
  "AwaitExpression",
  "BinaryExpression",
  "CallExpression",
  "ConditionalExpression",
  "NewExpression",
  "ObjectExpression",
  "OptionalChainingExpression",
  "ParenthesisExpression",
  "SequenceExpression",
  "TaggedTemplateExpression",
  "TemplateLiteral",
  "TsAsExpression",
  "TsConstAssertion",
  "TsInstantiation",
  "TsNonNullExpression",
  "TsSatisfiesExpression",
  "TsTypeAssertion",
  "UnaryExpression",
  "UpdateExpression",
]);
