import type { Namespace } from "./namespace";
import type { StyleValue } from "../types";
import { applyManagedFormProp, isManagedFormProp } from "./forms";
import { setAttr } from "./attr";
import { applyStyle } from "./styles";
import { normalizeAttr } from "./aliases";

function applyClass(el: Element, value: unknown): unknown {
  if (value == null || value === false) {
    el.removeAttribute("class");
  } else {
    el.setAttribute("class", String(value));
  }

  return value;
}

export function applyProp(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev: unknown,
): unknown {
  if (value === prev || name === "children" || name === "key") {
    return prev;
  }

  switch (name) {
    case "class":
    case "className":
      return applyClass(el, value);

    case "style":
      return applyStyle(
        el,
        value as StyleValue | null | undefined,
        prev as StyleValue | null | undefined,
      );
  }

  if (isManagedFormProp(el, name)) {
    return applyManagedFormProp(el, name, value);
  }

  setAttr(el, normalizeAttr(name), value, ns);
  return value;
}