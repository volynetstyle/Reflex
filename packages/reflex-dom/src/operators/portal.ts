import type { JSXRenderable, MaybeAccessor } from "../types";
import { toAccessor } from "./shared";

export const PORTAL_RENDERABLE = Symbol.for("reflex-dom.portal");

export interface PortalProps {
  to: MaybeAccessor<(ParentNode & Node) | null | undefined>;
  children?: JSXRenderable;
}

export interface PortalRenderable {
  readonly kind: typeof PORTAL_RENDERABLE;
  readonly to: () => (ParentNode & Node) | null | undefined;
  readonly children: JSXRenderable;
}

export function Portal(props: PortalProps): PortalRenderable {
  return {
    kind: PORTAL_RENDERABLE,
    to: toAccessor(props.to),
    children: props.children ?? null,
  };
}
