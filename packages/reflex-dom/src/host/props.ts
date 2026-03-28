import type { Namespace } from "./namespace";
import type { StyleValue } from "../types";
import { setAttr } from "./attr";
import { applyStyle } from "./styles";
import { normalizeAttr } from "./aliases";

function isIgnoredProp(name: string): boolean {
  return name === "children" || name === "key";
}

function isClassProp(name: string): boolean {
  return name === "class" || name === "className";
}

function setClass(el: Element, value: unknown): unknown {
  if (value == null || value === false) {
    el.removeAttribute("class");
  } else {
    el.setAttribute("class", String(value));
  }
  return value;
}

function setStyle(
  el: Element,
  value: unknown,
  prev: unknown,
): StyleValue | null | undefined {
  return applyStyle(
    el,
    value as StyleValue | null | undefined,
    prev as StyleValue | null | undefined,
  );
}

export function applyProp(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev: unknown,
): unknown {
  if (isIgnoredProp(name)) {
    return prev;
  }

  if (value === prev) {
    return prev;
  }

  if (isClassProp(name)) {
    return setClass(el, value);
  }

  if (name === "style") {
    return setStyle(el, value, prev);
  }

  setAttr(el, normalizeAttr(name), value, ns);
  return value;
}
