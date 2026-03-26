import { Namespace, XLINK_NS, URL_ATTRS } from "./namespace";
import { sanitizeURL } from "../drafts/client/sanitize";

const enum AttrKind {
  Property = 0,
  Attribute = 1,
  XLink = 2,
}

function isAriaAttr(name: string): boolean {
  return (
    name.length > 5 &&
    name.charCodeAt(0) === 97 &&
    name.charCodeAt(1) === 114 &&
    name.charCodeAt(2) === 105 &&
    name.charCodeAt(3) === 97 &&
    name.charCodeAt(4) === 45
  );
}

function isDataAttr(name: string): boolean {
  return (
    name.length > 5 &&
    name.charCodeAt(0) === 100 &&
    name.charCodeAt(1) === 97 &&
    name.charCodeAt(2) === 116 &&
    name.charCodeAt(3) === 97 &&
    name.charCodeAt(4) === 45
  );
}

function resolveAttrKind(el: Element, name: string, ns: Namespace): AttrKind {
  if (name === "xlink:href") return AttrKind.XLink;
  if (ns !== "svg" && !isAriaAttr(name) && !isDataAttr(name) && name in el) {
    return AttrKind.Property;
  }
  return AttrKind.Attribute;
}

function clearProperty(el: Element, name: string): void {
  const target = el as any;
  target[name] = typeof target[name] === "boolean" ? false : "";
}

function setProperty(el: Element, name: string, value: unknown): void {
  const target = el as any;
  target[name] =
    typeof target[name] === "boolean" ? value === true : (value ?? "");
}

function setAttributeValue(el: Element, name: string, value: unknown): void {
  if (value === true) {
    el.setAttribute(name, "");
    return;
  }

  const normalized =
    URL_ATTRS.has(name) && typeof value === "string"
      ? sanitizeURL(value)
      : value;

  el.setAttribute(name, String(normalized));
}

export function setAttr(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev?: unknown,
): unknown {
  if (value === prev) return prev;

  switch (resolveAttrKind(el, name, ns)) {
    case AttrKind.XLink:
      if (value == null || value === false) {
        el.removeAttributeNS(XLINK_NS, "href");
      } else {
        el.setAttributeNS(XLINK_NS, name, String(value));
      }
      return value;

    case AttrKind.Property:
      if (value == null || value === false) {
        clearProperty(el, name);
        el.removeAttribute(name);
      } else {
        setProperty(el, name, value);
      }
      return value;

    default:
      if (value == null || value === false) {
        el.removeAttribute(name);
      } else {
        setAttributeValue(el, name, value);
      }
      return value;
  }
}
