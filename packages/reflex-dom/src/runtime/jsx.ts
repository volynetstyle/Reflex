import { createComponentRenderable } from "../component";
import { createElementRenderable } from "../element";
import { Fragment, type JSXTag } from "../host/namespace";
import type {
  AttributeKey,
  Component,
  DOMProps,
  ElementProps,
  ElementTag,
  JSXRenderable,
} from "../types";

type FragmentProps = {
  children?: JSXRenderable;
};

type RuntimeComponent = (props: unknown) => JSXRenderable;

export { Fragment };

export function jsx(
  type: typeof Fragment,
  props: FragmentProps | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<Tag extends ElementTag>(
  type: Tag,
  props: ElementProps<Tag> | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<P>(
  type: Component<P>,
  props: P | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx(
  type: JSXTag,
  props: DOMProps | Record<string, unknown> | FragmentProps | null,
  _key?: unknown,
): JSXRenderable {
  const p = props ?? {};

  if (type === Fragment) {
    return (p as FragmentProps).children ?? null;
  }

  if (typeof type === "function") {
    return createComponentRenderable(type as RuntimeComponent, p);
  }

  return createElementRenderable(
    type as ElementTag,
    p as ElementProps<ElementTag>,
  );
}

export const jsxs = jsx;
export const jsxDEV: typeof jsx = (
  type: JSXTag,
  props: DOMProps | Record<string, unknown> | FragmentProps | null,
  key?: unknown,
) => jsx(type as never, props as never, key as AttributeKey | undefined);
