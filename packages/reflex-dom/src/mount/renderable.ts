import { COMPONENT_RENDERABLE } from "../operators/component";
import { ELEMENT_RENDERABLE } from "../operators/element";
import {
  FOR_RENDERABLE,
  PORTAL_RENDERABLE,
  SHOW_RENDERABLE,
  SWITCH_RENDERABLE,
} from "../operators";
import type { JSXRenderable, RenderableRecord } from "../types";

export const enum RenderableKind {
  Empty = 0,
  Array = 1,
  Node = 2,
  Accessor = 3,
  Element = 4,
  Component = 5,
  Show = 6,
  Switch = 7,
  For = 8,
  Portal = 9,
  Text = 10,
}

export type Renderable = JSXRenderable | unknown;
export type JSXElement = JSXRenderable;
export type InternalRenderable = RenderableRecord;

export function isEmpty(value: unknown): boolean {
  return value == null || typeof value === "boolean";
}

export function isTextValue(
  value: unknown,
): value is string | number | bigint {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  );
}

export function isNodeValue(value: unknown): value is Node {
  return typeof Node !== "undefined" && value instanceof Node;
}

export function isArrayValue(value: unknown): value is Iterable<unknown> {
  return (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      Symbol.iterator in value)
  );
}

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function getRenderableKind(value: unknown): unknown {
  return typeof value === "object" && value !== null
    ? (value as { kind?: unknown }).kind
    : undefined;
}

export function classifyRenderable(value: unknown): RenderableKind {
  if (isEmpty(value)) {
    return RenderableKind.Empty;
  }

  if (isArrayValue(value)) {
    return RenderableKind.Array;
  }

  if (isNodeValue(value)) {
    return RenderableKind.Node;
  }

  if (isAccessor(value)) {
    return RenderableKind.Accessor;
  }

  switch (getRenderableKind(value)) {
    case ELEMENT_RENDERABLE:
      return RenderableKind.Element;
    case COMPONENT_RENDERABLE:
      return RenderableKind.Component;
    case SHOW_RENDERABLE:
      return RenderableKind.Show;
    case SWITCH_RENDERABLE:
      return RenderableKind.Switch;
    case FOR_RENDERABLE:
      return RenderableKind.For;
    case PORTAL_RENDERABLE:
      return RenderableKind.Portal;
    default:
      return RenderableKind.Text;
  }
}
