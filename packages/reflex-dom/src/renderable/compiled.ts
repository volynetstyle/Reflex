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
 * | client mount, HTML namespace               | `create(doc, mountHole, mount)` |
 * | client mount, any other namespace          | `fallback()`               |
 * | `create` returns `null`                    | `fallback()`               |
 * | hydration                                  | `fallback()`               |
 * | SSR (`renderToString`)                     | `fallback()`               |
 *
 * `fallback()` must describe the same DOM as `create`, so either path is
 * semantically valid wherever the renderer picks it.
 *
 * A region captures dynamic values at descriptor creation. Template plans
 * mount a single guarded child at a marker. Ordered native plans use `mount`
 * to bind props before children and append children one by one, preserving
 * observable ref/effect/component order. Reactivity and ownership stay with
 * the renderer. Ordered plans decline before DOM work without version 1.
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

/** Ordered mount operations shared by generated native regions. */
export interface CompiledDOMMount {
  readonly version: 1;
  prop(element: Element, name: string, value: unknown): void;
  props(element: Element, props: Record<string, unknown>): void;
  child(parent: Element, value: unknown, scalar: boolean): void;
}

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
  create(doc: Document, mountHole: CompiledHoleMount, mount?: CompiledDOMMount): Node | null;
  /**
   * The equivalent uncompiled renderable, built from the same hole values.
   * Evaluating it runs no user expressions again: dynamic values were
   * captured when the region was created.
   */
  fallback(): JSXRenderable;
}
