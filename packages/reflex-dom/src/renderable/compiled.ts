import type { JSXRenderable } from "../types";

/**
 * Experimental internal bridge for `@volynets/reflex-dom-compiler`. Not public
 * API: the shape may change with the compiler prototype.
 */
export const COMPILED_DOM_RENDERABLE = Symbol.for("reflex-dom.compiled");

/**
 * A statically compiled region: a host element subtree whose props and
 * children are literals, so building it runs no user code.
 */
export interface CompiledDOMRenderable {
  readonly kind: typeof COMPILED_DOM_RENDERABLE;
  /**
   * Builds the region's nodes in `doc` during mount. Returns `null` when the
   * compiled strategy is unavailable (for example, Trusted Types reject the
   * template HTML); the renderer then mounts `fallback()` instead.
   */
  create(doc: Document): Node | null;
  /**
   * The equivalent uncompiled renderable. Hydration, SSR and mounts outside the
   * HTML namespace use it, so those paths keep their existing semantics.
   */
  fallback(): JSXRenderable;
}
