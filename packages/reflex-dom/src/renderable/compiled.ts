import type { JSXRenderable } from "../types";

/**
 * Kind of a compiled DOM region: reflex-dom's internal optimization form for a
 * renderable whose DOM construction was prepared ahead of time (by
 * `@volynets/reflex-dom-compiler`). Not public API.
 *
 * The renderer knows this protocol and nothing about how a region was
 * compiled:
 *
 * | situation                                  | renderer calls |
 * | ------------------------------------------ | -------------- |
 * | client mount, HTML namespace               | `create(doc)`  |
 * | client mount, any other namespace          | `fallback()`   |
 * | `create` returns `null`                    | `fallback()`   |
 * | hydration                                  | `fallback()`   |
 * | SSR (`renderToString`)                     | `fallback()`   |
 *
 * `fallback()` must describe the same DOM as `create`, so either path is
 * semantically valid wherever the renderer picks it.
 */
export const COMPILED_DOM_RENDERABLE = Symbol.for("reflex-dom.compiled");

export interface CompiledDOMRenderable {
  readonly kind: typeof COMPILED_DOM_RENDERABLE;
  /**
   * Builds the region's nodes in `doc` during mount and returns its single
   * root, still detached. Returns `null`, before any observable DOM mutation,
   * when the compiled path is unavailable in this environment (for example,
   * Trusted Types reject template HTML, or `doc` is not an HTML document); the
   * renderer then mounts `fallback()`. Exceptions propagate like any mount
   * error.
   */
  create(doc: Document): Node | null;
  /**
   * The equivalent uncompiled renderable. Evaluating it must run no user code
   * whose timing matters (compiled regions contain only literals).
   */
  fallback(): JSXRenderable;
}
