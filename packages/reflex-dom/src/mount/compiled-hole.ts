import { isEmptyRenderableValue, isTextRenderableValue } from "../renderable/kind";
import type { CompiledHoleMount } from "../renderable/compiled";
import { mountElementChildAccessor } from "./text-binding";

/**
 * Mounts one dynamic child of a compiled region at its marker, exactly as
 * `mountElement` would have mounted it as a child of `parent`, then removes
 * the marker. `scalar` marks the element's sole `children` value, whose text
 * goes through `textContent` (an empty string creates no node).
 *
 * Accepts the values a region may hand over: text, empty values and
 * accessors. The region checks them before building anything.
 */
export const mountCompiledHole: CompiledHoleMount = (parent, marker, value, scalar) => {
  const doc = marker.ownerDocument!;

  if (typeof value === "function") {
    // Children of compiled (HTML) elements are in the HTML namespace.
    mountElementChildAccessor(parent, value as () => unknown, "html", doc, marker);
  } else if (isTextRenderableValue(value)) {
    const text = String(value);
    if (!(scalar && text === "")) parent.insertBefore(doc.createTextNode(text), marker);
  } else if (!isEmptyRenderableValue(value)) {
    throw new TypeError("Unsupported compiled hole value");
  }

  parent.removeChild(marker);
};
