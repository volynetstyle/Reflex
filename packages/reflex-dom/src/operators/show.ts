import {
  Show as createShowRenderable,
  type ShowProps as FrameworkShowProps,
  type ShowRenderable as FrameworkShowRenderable,
} from "@volynets/reflex-framework";
import type { DOMRangeHandle } from "../host/range-handle";
import type { Ref } from "../types/core";

export { SHOW_RENDERABLE, resolveShowValue } from "@volynets/reflex-framework";

/**
 * Props accepted by `Show`.
 *
 * @remarks
 * **When to use:** for one conditional branch; the child may receive the
 * non-null value of `when`.
 * **When not to use:** when `0`, `false`, or an empty string are valid displayed
 * values, or when exact-value matching is needed; use an explicit condition or
 * `Switch` instead.
 *
 * @typeParam T The condition value type.
 */
export type ShowProps<T> = FrameworkShowProps<T, Node> & {
  ref?: Ref<DOMRangeHandle>;
};
export type ShowRenderable<T> = FrameworkShowRenderable<T, Node> & {
  readonly ref?: Ref<DOMRangeHandle>;
};

/**
 * Shows one branch when `when` is truthy and `fallback` otherwise.
 *
 * @remarks
 * **When to use:** for one conditional branch whose child may depend on the
 * non-null condition value.
 * **When not to use:** when falsy values are valid displayed values or exact
 * matching is needed; use `Switch`.
 *
 * @param props The condition, branch content, and optional fallback.
 * @typeParam T The condition value type.
 */
export function Show<T>(props: ShowProps<T>): ShowRenderable<T> {
  const renderable: ShowRenderable<T> = createShowRenderable<T, Node>(props);
  return props.ref === undefined ? renderable : { ...renderable, ref: props.ref };
}
