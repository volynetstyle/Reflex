import { RenderableKind, getTaggedRenderableKind } from "./kind";
import { isDOMNode } from "../host/document";

export function classifyRenderable(value: unknown): RenderableKind {
  switch (typeof value) {
    case "undefined":
    case "boolean":
      return RenderableKind.Empty;
    case "function":
      return RenderableKind.Accessor;
    case "object":
      if (value === null) return RenderableKind.Empty;
      break;
    default:
      return RenderableKind.Text;
  }

  if (Array.isArray(value)) return RenderableKind.Array;
  if (isDOMNode(value)) return RenderableKind.Node;

  return (
    getTaggedRenderableKind(value) ??
    (typeof (value as Iterable<unknown>)[Symbol.iterator] === "function"
      ? RenderableKind.Array
      : RenderableKind.Text)
  );
}
