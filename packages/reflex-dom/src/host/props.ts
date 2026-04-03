import type { Namespace } from "./namespace";
import type { StyleValue } from "../types";
import { setAttr } from "./attr";
import { applyStyle } from "./styles";
import { normalizeAttr } from "./aliases";

export function applyProp(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev: unknown,
): unknown {
  if (name === "children" || name === "key") {
    return prev;
  }

  if (value === prev) {
    return prev;
  }

  if (name === "class" || name === "className") {
    if (value == null || value === false) {
      el.removeAttribute("class");
    } else {
      el.setAttribute("class", String(value));
    }

    return value;
  }

  if (name === "style") {
    return applyStyle(
      el,
      value as StyleValue | null | undefined,
      prev as StyleValue | null | undefined,
    );
  }

  setAttr(el, normalizeAttr(name), value, ns);
  return value;
}
