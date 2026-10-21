import type { CompiledDOMMount } from "../renderable/compiled";
import { isTextRenderableValue } from "../renderable/kind";
import { appendRenderableNodes } from "./append";
import { bindElementProp, bindElementProps } from "./element-binder";

/** Called only in an active DOM operation, in the region's owning scope. */
export const compiledDOMMount: CompiledDOMMount = Object.freeze<CompiledDOMMount>({
  version: 1,
  prop(element, name, value) {
    bindElementProp(element, name, value, "html");
  },
  props(element, props) {
    bindElementProps(element, props, "html");
  },
  child(parent, value, scalar) {
    if (scalar && isTextRenderableValue(value))
      parent.textContent = String(value);
    else appendRenderableNodes(parent, value, "html");
  },
});
