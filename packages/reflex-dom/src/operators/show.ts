import {
  Show as createShowRenderable,
  type ShowProps as FrameworkShowProps,
  type ShowRenderable as FrameworkShowRenderable,
} from "@volynets/reflex-framework";

export {
  SHOW_RENDERABLE,
  resolveShowValue,
} from "@volynets/reflex-framework";

export type ShowProps<T> = FrameworkShowProps<T, Node>;
export type ShowRenderable<T> = FrameworkShowRenderable<T, Node>;

export function Show<T>(props: ShowProps<T>): ShowRenderable<T> {
  return createShowRenderable<T, Node>(props);
}
