import {
  Switch as createSwitchRenderable,
  type SwitchCase as FrameworkSwitchCase,
  type SwitchProps as FrameworkSwitchProps,
  type SwitchRenderable as FrameworkSwitchRenderable,
} from "@volynets/reflex-framework";

export {
  SWITCH_RENDERABLE,
  resolveSwitchValue,
} from "@volynets/reflex-framework";

/**
 * One `Switch` alternative: an exact value or predicate and its content.
 *
 * @remarks
 * **When to use:** as an entry in `cases` or to type switch alternatives.
 * **When not to use:** for an independent boolean condition or per-item list
 * rendering; use `Show` or `For` instead.
 *
 * @typeParam T The value matched by `when`.
 */
export type SwitchCase<T> = FrameworkSwitchCase<T, Node>;
/**
 * Props for `Switch`: a value, ordered cases, and an optional fallback.
 *
 * @remarks
 * **When to use:** when choosing among several alternatives by value.
 * **When not to use:** when a single truthy/falsy choice is enough; use `Show`.
 * The first matching case wins.
 *
 * @typeParam T The value type passed to cases.
 */
export type SwitchProps<T> = FrameworkSwitchProps<T, Node>;
export type SwitchRenderable<T> = FrameworkSwitchRenderable<T, Node>;

/**
 * Selects the first case whose value matches with `Object.is` or whose
 * predicate returns `true`.
 *
 * @param props The value source, ordered cases, and optional fallback.
 * @typeParam T The matched value type.
 */
export function Switch<T>(props: SwitchProps<T>): SwitchRenderable<T> {
  return createSwitchRenderable<T, Node>(props);
}
