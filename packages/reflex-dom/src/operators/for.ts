import {
  For as createForRenderable,
  type ForProps as FrameworkForProps,
  type ForRenderable as FrameworkForRenderable,
} from "@volynets/reflex-framework";
import type { DOMRangeHandle } from "../host/range-handle";
import type { Ref } from "../types/core";

export { FOR_RENDERABLE } from "@volynets/reflex-framework";

/**
 * Props accepted by `For`.
 *
 * @remarks
 * **When to use:** to type a wrapper around keyed list rendering.
 * **When not to use:** for static collections without row identity or a single
 * conditional branch; pass an array directly or use `Show` instead.
 *
 * @typeParam T The list item type.
 */
export type ForProps<T> = FrameworkForProps<T, Node> & {
  ref?: Ref<DOMRangeHandle>;
};
export type ForRenderable<T> = FrameworkForRenderable<T, Node> & {
  readonly ref?: Ref<DOMRangeHandle>;
};

/**
 * Renders a reactive list with stable identity for each item. The `by` key must
 * be stable and unique within the list.
 *
 * @remarks
 * **When to use:** for changing lists whose rows should survive insertions,
 * removals, and reordering.
 * **When not to use:** for static collections without row identity or for one
 * conditional branch; use `Show` instead.
 *
 * @param props The list source, key function, row renderer, and optional fallback.
 * @typeParam T The list item type.
 */
export function For<T>(props: ForProps<T>): ForRenderable<T> {
  const renderable: ForRenderable<T> = createForRenderable<T, Node>(props);
  return props.ref === undefined ? renderable : { ...renderable, ref: props.ref };
}
