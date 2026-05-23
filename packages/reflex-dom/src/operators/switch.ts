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

export type SwitchCase<T> = FrameworkSwitchCase<T, Node>;
export type SwitchProps<T> = FrameworkSwitchProps<T, Node>;
export type SwitchRenderable<T> = FrameworkSwitchRenderable<T, Node>;

export function Switch<T>(props: SwitchProps<T>): SwitchRenderable<T> {
  return createSwitchRenderable<T, Node>(props);
}
