import type { Namespace } from "./namespace";
import { XLINK_NS, URL_ATTRS } from "./namespace";
import { sanitizeURL } from "./sanitize";

/** Whether `name` is an `aria-*` attribute. */
export function isAriaAttr(name: string): boolean {
  return (
    name.length > 5 &&
    name.charCodeAt(0) === 97 &&
    name.charCodeAt(1) === 114 &&
    name.charCodeAt(2) === 105 &&
    name.charCodeAt(3) === 97 &&
    name.charCodeAt(4) === 45
  );
}

/**
 * HTML enumerated attributes written as tokens for booleans, as
 * `[true, false]`. A bare attribute means another state (`draggable` reads
 * `auto`), so `true` must not be written as an empty attribute.
 */
export const ENUMERATED_BOOLEAN_ATTRS: Record<
  string,
  readonly [string, string] | undefined
> = {
  autocorrect: ["on", "off"],
  draggable: ["true", "false"],
  spellcheck: ["true", "false"],
  translate: ["yes", "no"],
};

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

/** Per prototype: whether assigning a property name can succeed. */
const assignableByPrototype = new WeakMap<object, Map<string, boolean>>();

function hasAssignableDescriptor(start: object | null, name: string): boolean {
  for (let proto = start; proto !== null; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);

    if (descriptor !== undefined) {
      return descriptor.set !== undefined || descriptor.writable === true;
    }
  }

  return false;
}

/**
 * Whether `el[name] = value` can succeed. Getter-only properties (`form`,
 * `list`, getter-only custom element accessors) throw in strict mode, so their
 * content attribute is written instead.
 */
function isAssignableProperty(el: Element, name: string): boolean {
  const proto = Object.getPrototypeOf(el) as object;
  let names = assignableByPrototype.get(proto);

  if (names === undefined) {
    names = new Map();
    assignableByPrototype.set(proto, names);
  }

  let assignable = names.get(name);

  if (assignable === undefined) {
    assignable = hasAssignableDescriptor(proto, name);
    names.set(name, assignable);
  }

  // An own instance property (a class field) shadows the prototype accessor.
  return assignable || hasAssignableDescriptor(el, name);
}

/** A string that a numeric property converts without losing its meaning. */
function isNumericString(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

/**
 * Whether a property of the current type keeps `value`. A string assigned to
 * a numeric property (`width="50%"`) or to a boolean one
 * (`hidden="until-found"`) would be coerced, and `true` assigned to a string
 * property (`download`) would become `"true"`; their content attributes keep
 * the value as written.
 */
function keepsValueAsProperty(current: unknown, value: unknown): boolean {
  switch (typeof current) {
    case "number":
      return typeof value !== "string" || isNumericString(value);
    case "boolean":
      return typeof value !== "string";
    case "string":
      return value !== true;
    default:
      return true;
  }
}

function clearProperty(el: Element, name: string): void {
  const target = el as unknown as Record<string, unknown>;
  target[name] = typeof target[name] === "boolean" ? false : "";
}

function setPlainAttribute(el: Element, name: string, value: unknown): void {
  if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, normalizeURLAttr(name, value) + "");
  }
}

function setProperty(el: Element, name: string, value: unknown): void {
  const target = el as unknown as Record<string, unknown>;
  const current = target[name];
  const normalized = normalizeURLAttr(name, value);

  if (!keepsValueAsProperty(current, normalized)) {
    setPlainAttribute(el, name, normalized);
    return;
  }

  target[name] =
    typeof current === "boolean" ? normalized === true : (normalized ?? "");
}

export function setAttr(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev?: unknown,
): unknown {
  if (value === prev) return prev;

  if (typeof value === "boolean") {
    // ARIA true/false states are the tokens "true"/"false"; an empty or
    // missing attribute means "not set", not false.
    if (isAriaAttr(name)) {
      el.setAttribute(name, value ? "true" : "false");
      return value;
    }

    if (ns !== "svg") {
      const tokens = ENUMERATED_BOOLEAN_ATTRS[name];

      if (tokens !== undefined) {
        el.setAttribute(name, tokens[value ? 0 : 1]);
        return value;
      }
    }
  }

  const remove = value == null || value === false;

  if (name === "xlink:href") {
    if (remove) {
      el.removeAttributeNS(XLINK_NS, "href");
    } else {
      el.setAttributeNS(XLINK_NS, "href", normalizeURLAttr(name, value) + "");
    }

    return value;
  }

  if (
    ns !== "svg" &&
    !isAriaOrDataAttr(name) &&
    name in el &&
    isAssignableProperty(el, name)
  ) {
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
