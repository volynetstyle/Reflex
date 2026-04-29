import type { Namespace } from "./namespace";
import { XLINK_NS, URL_ATTRS } from "./namespace";
import { sanitizeURL } from "./sanitize";

function isAriaOrDataAttr(name: string): boolean {
  if (name.length <= 5) return false;

  const c0 = name.charCodeAt(0);
  const c1 = name.charCodeAt(1);
  const c2 = name.charCodeAt(2);
  const c3 = name.charCodeAt(3);
  const c4 = name.charCodeAt(4);

  // aria-
  if (c0 === 97 && c1 === 114 && c2 === 105 && c3 === 97 && c4 === 45) {
    return true;
  }

  // data-
  return c0 === 100 && c1 === 97 && c2 === 116 && c3 === 97 && c4 === 45;
}

function normalizeURLAttr(name: string, value: unknown): unknown {
  return URL_ATTRS.has(name) && typeof value === "string"
    ? sanitizeURL(value)
    : value;
}

function clearProperty(el: Element, name: string): void {
  const target = el as unknown as Record<string, unknown>;
  target[name] = typeof target[name] === "boolean" ? false : "";
}

function setProperty(el: Element, name: string, value: unknown): void {
  const target = el as unknown as Record<string, unknown>;
  const current = target[name];
  const normalized = normalizeURLAttr(name, value);

  target[name] =
    typeof current === "boolean" ? normalized === true : (normalized ?? "");
}

function setPlainAttribute(el: Element, name: string, value: unknown): void {
  if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, String(normalizeURLAttr(name, value)));
  }
}

export function setAttr(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev?: unknown,
): unknown {
  if (value === prev) return prev;

  const remove = value == null || value === false;

  if (name === "xlink:href") {
    if (remove) {
      el.removeAttributeNS(XLINK_NS, "href");
    } else {
      el.setAttributeNS(
        XLINK_NS,
        "href",
        String(normalizeURLAttr(name, value)),
      );
    }

    return value;
  }

  if (ns !== "svg" && !isAriaOrDataAttr(name) && name in el) {
    if (remove) {
      clearProperty(el, name);
      el.removeAttribute(name);
    } else {
      setProperty(el, name, value);
    }

    return value;
  }

  if (remove) {
    el.removeAttribute(name);
  } else {
    setPlainAttribute(el, name, value);
  }

  return value;
}
