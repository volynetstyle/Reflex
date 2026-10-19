/**
 * The DOM semantics of static values: which tags and props compile, and to
 * what. Kept free of Babel so tests can check these tables in real browsers
 * against the reflex-dom runtime.
 */
import type { StaticAttribute } from "./model";

// ---------------------------------------------------------------------------
// Literals: the only values a static region may contain.

export type Literal =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "bigint"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "undefined" };

/** `String(value)` exactly as the runtime computes it. */
export function textOf(literal: Literal): string | null {
  switch (literal.kind) {
    case "string":
      return literal.value;
    case "number":
      return String(literal.value);
    case "bigint":
      return literal.value;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Elements. The supported set excludes every element whose DOM construction
// differs from `createElement` + attributes + children in reflex-dom: form
// controls (managed properties), parser-special elements, tables, foreign
// namespaces and custom elements.

export const COMPILABLE_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote",
  "br", "button", "cite", "code", "dd", "del", "details", "dfn", "div", "dl",
  "dt", "em", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hgroup", "hr", "i", "img", "ins", "kbd", "label",
  "legend", "li", "main", "mark", "menu", "nav", "ol", "p", "q", "rp", "rt",
  "ruby", "s", "samp", "search", "section", "small", "span", "strong", "sub",
  "summary", "sup", "time", "u", "ul", "var", "wbr",
]);

const TABLE_TAGS = new Set([
  "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "td", "th",
]);
const FORM_TAGS = new Set([
  "input", "select", "textarea", "option", "optgroup", "datalist", "form",
  "output", "progress", "meter",
]);

export function rejectTag(tag: string): string | null {
  if (COMPILABLE_TAGS.has(tag)) return null;
  if (tag.includes("-")) return `custom element <${tag}>`;
  if (tag === "svg" || tag === "math") return `foreign namespace <${tag}>`;
  if (TABLE_TAGS.has(tag)) return `table parsing context <${tag}>`;
  if (FORM_TAGS.has(tag)) return `form control semantics <${tag}>`;
  return `unsupported element <${tag}>`;
}

// ---------------------------------------------------------------------------
// Props. A prop compiles only when its static value has one DOM effect in every
// engine: the attribute it ends up as. reflex-dom assigns many names through
// DOM properties (`name in element`), so a name is listed only where property
// and attribute paths store the same string, independently of the tag.

export const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  className: "class",
  htmlFor: "for",
  crossOrigin: "crossorigin",
};

/**
 * Reflected `DOMString` attributes, plus attribute-only names. Verified for
 * every compilable tag and a value corpus against the runtime in jsdom,
 * Chromium, Firefox and WebKit (`test/semantics.conformance.*`). `type` is
 * absent: `fieldset.type` is getter-only, so reflex-dom's property assignment
 * throws there, and jsdom normalizes `button.type` to "submit".
 */
export const STRING_ATTRIBUTES: ReadonlySet<string> = new Set([
  "id", "title", "lang", "dir", "role", "slot", "alt", "target", "rel",
  "name", "download", "datetime", "for", "loading", "decoding", "crossorigin",
]);
/** Reflected booleans: only `true` (present) and absence agree across paths. */
export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set(["disabled", "hidden", "inert"]);
/** Sanitized by reflex-dom at runtime; compiled only when unchanged by it. */
export const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src"]);

const DATA_OR_ARIA = /^(data|aria)-[a-z0-9._-]+$/;

export type AttributeResult =
  /** The runtime never applies the prop (`undefined`, `key`). */
  | { readonly kind: "skip" }
  /**
   * The runtime removes the attribute: nothing on a fresh element, but it
   * undoes an earlier alias of the same attribute, so it counts as a write.
   */
  | { readonly kind: "remove"; readonly name: string }
  | { readonly kind: "set"; readonly attribute: StaticAttribute }
  | { readonly kind: "reject"; readonly reason: string };

const SKIP: AttributeResult = { kind: "skip" };

function remove(name: string): AttributeResult {
  return { kind: "remove", name };
}

function set(name: string, value: string): AttributeResult {
  return { kind: "set", attribute: { name, value } };
}

function reject(reason: string): AttributeResult {
  return { kind: "reject", reason };
}

function isAbsent(literal: Literal): boolean {
  return (
    literal.kind === "null" ||
    literal.kind === "undefined" ||
    (literal.kind === "boolean" && !literal.value)
  );
}

export function staticAttribute(prop: string, literal: Literal | null): AttributeResult {
  // reflex-dom skips undefined props before looking at their names.
  if (literal?.kind === "undefined") return SKIP;
  if (prop === "key") return literal === null ? reject(`dynamic prop "key"`) : SKIP;
  if (prop === "ref") return reject("ref");
  if (prop.startsWith("on")) return reject(`event prop "${prop}"`);
  if (prop === "style") return reject("style is normalized through CSSOM");
  if (literal === null) return reject(`dynamic prop "${prop}"`);

  const name = ATTRIBUTE_ALIASES[prop] ?? prop;
  const text = textOf(literal);

  if (name === "class") {
    if (text !== null) return set(name, text);
    if (literal.kind === "boolean" && literal.value) return set(name, "true");
    return remove(name);
  }

  if (DATA_OR_ARIA.test(name)) {
    if (text !== null) return set(name, text);
    if (literal.kind === "boolean") {
      if (name.startsWith("aria-")) return set(name, literal.value ? "true" : "false");
      return literal.value ? set(name, "") : remove(name);
    }
    return remove(name);
  }

  if (BOOLEAN_ATTRIBUTES.has(name)) {
    if (literal.kind === "boolean" && literal.value) return set(name, "");
    if (isAbsent(literal)) return remove(name);
    return reject(`non-boolean value for "${name}"`);
  }

  if (URL_ATTRIBUTES.has(name)) {
    if (isAbsent(literal)) return remove(name);
    if (literal.kind !== "string") return reject(`non-string URL "${name}"`);
    if (sanitizeURL(literal.value) !== literal.value) {
      return reject(`URL "${name}" is sanitized at runtime`);
    }
    return set(name, literal.value);
  }

  if (STRING_ATTRIBUTES.has(name)) {
    if (text !== null) return set(name, text);
    if (isAbsent(literal)) return remove(name);
    return reject(`boolean value for "${name}"`);
  }

  return reject(`prop "${prop}" has no verified static semantics`);
}


// ---------------------------------------------------------------------------
// Port of reflex-dom's `sanitizeURL`: a compiled URL must be one the runtime
// would leave unchanged.

const BLOCKED_PROTOCOLS = ["javascript:", "vbscript:"];

function sanitizeURL(url: string): string {
  let start = 0;
  while (start < url.length && url.charCodeAt(start) <= 0x20) start++;

  for (const protocol of BLOCKED_PROTOCOLS) {
    let index = start;
    let matched = 0;
    while (matched < protocol.length && index < url.length) {
      const code = url.charCodeAt(index);
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        index++;
        continue;
      }
      const lower = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
      if (lower !== protocol.charCodeAt(matched)) break;
      index++;
      matched++;
    }
    if (matched === protocol.length) return "about:blank";
  }
  return url;
}
