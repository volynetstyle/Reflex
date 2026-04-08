import { COMPONENT_RENDERABLE } from "./operators/component";
import { ELEMENT_RENDERABLE } from "./operators/element";
import {
  FOR_RENDERABLE,
  PORTAL_RENDERABLE,
  SHOW_RENDERABLE,
  SWITCH_RENDERABLE,
} from "./operators";

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

export function isEmptyRenderableValue(value: unknown): boolean {
  return value == null || typeof value === "boolean";
}

export function isTextRenderableValue(
  value: unknown,
): value is string | number | bigint {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  );
}

export function getTaggedRenderableKind(
  value: unknown,
): RenderableKind | undefined {
  const recordKind =
    typeof value === "object" && value !== null
      ? (value as { kind?: unknown }).kind
      : undefined;

  switch (recordKind) {
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
      return undefined;
  }
}
