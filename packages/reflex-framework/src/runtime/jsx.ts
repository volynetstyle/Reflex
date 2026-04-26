import { createComponentRenderable } from "../operators/component";
import { createElementRenderable } from "../operators/element";
import type { AttributeKey } from "../types/core";
import type { Component, JSXRenderable } from "../types/renderable";

export type FragmentProps<Host = never> = {
  children?: JSXRenderable<Host>;
};

type JSXType<P = unknown, Host = unknown> =
  | string
  | typeof Fragment
  | Component<P, Host>;

export const Fragment = Symbol.for("reflex.fragment");

const EMPTY_PROPS = Object.freeze({}) as Record<string, unknown>;

export function jsx(
  type: typeof Fragment,
  props: FragmentProps | null,
  key?: AttributeKey,
): JSXRenderable;

export function jsx<Tag extends string, Props extends Record<string, unknown>>(
  type: Tag,
  props: Props | null,
  key?: AttributeKey,
): JSXRenderable;

export function jsx<P, Host>(
  type: Component<P, Host>,
  props: P | null,
  key?: AttributeKey,
): JSXRenderable<Host>;

export function jsx(
  type: JSXType,
  props: Record<string, unknown> | FragmentProps | null,
  _key?: AttributeKey,
): JSXRenderable {
  if (type === Fragment) {
    return props === null ? null : ((props as FragmentProps).children ?? null);
  }

  const normalizedProps = props ?? EMPTY_PROPS;

  return typeof type === "function"
    ? createComponentRenderable(type, normalizedProps)
    : createElementRenderable(type, normalizedProps);
}

export const jsxs = jsx;

export const jsxDEV: typeof jsx = jsx;
