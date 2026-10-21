import {
  RenderableKind,
  getTaggedRenderableKind,
  isEmptyRenderableValue,
} from "./kind";
import { isDOMNode } from "../host/document";

function isIterableRenderableValue(value: unknown): value is Iterable<unknown> {
  return (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as Iterable<unknown>)[Symbol.iterator] === "function")
  );
}

export function classifyRenderable(value: unknown): RenderableKind {
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return RenderableKind.Text;
    case "function":
      return RenderableKind.Accessor;
    case "object":
      break;
    default:
      return isEmptyRenderableValue(value)
        ? RenderableKind.Empty
        : RenderableKind.Text;
  }

  if (value === null) return RenderableKind.Empty;
  if (Array.isArray(value)) return RenderableKind.Array;

  // Renderable records are the common case; check their tag before the
  // DOM-node brand check, which reads native properties.
  const tagged = getTaggedRenderableKind(value);
  if (tagged !== undefined) return tagged;

  if (isDOMNode(value)) return RenderableKind.Node;

  return isIterableRenderableValue(value)
    ? RenderableKind.Array
    : RenderableKind.Text;
}
