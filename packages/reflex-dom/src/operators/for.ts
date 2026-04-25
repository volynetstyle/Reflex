import {
  For as createForRenderable,
  type ForProps as FrameworkForProps,
  type ForRenderable as FrameworkForRenderable,
} from "@volynets/reflex-framework";

export { FOR_RENDERABLE } from "@volynets/reflex-framework";

export type ForProps<T> = FrameworkForProps<T, Node>;
export type ForRenderable<T> = FrameworkForRenderable<T, Node>;

export function For<T>(props: ForProps<T>): ForRenderable<T> {
  return createForRenderable<T, Node>(props);
}
