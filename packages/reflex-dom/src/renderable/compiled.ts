import type { JSXRenderable } from "../types";

/**
 * Kind of a compiled DOM region: reflex-dom's internal optimization form for a
 * renderable whose DOM construction was prepared ahead of time (by
 * `@volynets/reflex-dom-compiler`). Not public API.
 *
 * The renderer knows this protocol and nothing about how a region was
 * compiled:
 *
 * | situation                                  | renderer calls             |
 * | ------------------------------------------ | -------------------------- |
 * | client mount, HTML namespace               | `create(doc, mountHole)`   |
 * | client mount, any other namespace          | `fallback()`               |
 * | `create` returns `null`                    | `fallback()`               |
 * | hydration                                  | `fallback()`               |
 * | SSR (`renderToString`)                     | `fallback()`               |
 *
 * `fallback()` must describe the same DOM as `create`, so either path is
 * semantically valid wherever the renderer picks it.
 *
 * A region may contain dynamic children ("holes"): values computed when the
 * region was created, which the region does not build itself. It marks each
 * position with a node and hands the value to `mountHole`, so the renderer
 * owns everything that changes. Static structure comes from the region,
 * change from Reflex.
 */
export const COMPILED_DOM_RENDERABLE = Symbol.for("reflex-dom.compiled");

/**
 * Mounts `value` where `marker` stands among `parent`'s children, exactly as
 * that child would be mounted by the element path, and removes the marker.
 * `scalar` is true when the value was the element's whole `children`. Takes
 * text, empty values and accessors; the region must route anything else to
 * `fallback()` before building nodes.
 */
export type CompiledHoleMount = (
  parent: Element,
  marker: Node,
  value: unknown,
  scalar: boolean,
) => void;

export interface CompiledDOMRenderable {
  readonly kind: typeof COMPILED_DOM_RENDERABLE;
  /**
   * Builds the region's nodes in `doc` during mount and returns its single
   * root, still detached, after mounting its holes in document order through
   * `mountHole`. Returns `null`, before any observable DOM mutation, when the
   * compiled path is unavailable (Trusted Types reject template HTML, `doc` is
   * not an HTML document, a hole value the renderer does not accept here); the
   * renderer then mounts `fallback()`. Exceptions propagate like any mount
   * error.
   */
  create(doc: Document, mountHole: CompiledHoleMount): Node | null;
  /**
   * The equivalent uncompiled renderable, built from the same hole values.
   * Evaluating it runs no user code: the region's own content is literals and
   * its hole values were computed when the region was created.
   */
  fallback(): JSXRenderable;
}
