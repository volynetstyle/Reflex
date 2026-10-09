import type { JSXRenderable, MaybeAccessor } from "../types";
import { toAccessor } from "./shared";

export const PORTAL_RENDERABLE = Symbol.for("reflex-dom.portal");

/** Props for `Portal`. Its target may be absent while a portal is inactive. */
export interface PortalProps {
  /** Target node or accessor; `null`/`undefined` removes the portal range until a target is available. */
  to: MaybeAccessor<(ParentNode & Node) | null | undefined>;
  /** Content rendered into the target under the portal's source owner. */
  children?: JSXRenderable;
}

export interface PortalRenderable {
  readonly kind: typeof PORTAL_RENDERABLE;
  readonly to: () => (ParentNode & Node) | null | undefined;
  readonly children: JSXRenderable;
}

/**
 * Renders children in a target DOM node while retaining their source Reflex owner.
 *
 * @remarks
 * **When to use:** for overlays, popovers, and content outside the component's
 * local DOM subtree.
 * **When not to use:** for ordinary nesting or manual DOM movement; the portal
 * manages its own range and lifetime.
 *
 * @param props The target and children to render.
 */
export function Portal(props: PortalProps): PortalRenderable {
  return {
    kind: PORTAL_RENDERABLE,
    to: toAccessor(props.to),
    children: props.children ?? null,
  };
}
