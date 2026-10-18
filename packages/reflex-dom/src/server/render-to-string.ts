import type {
  ComponentRenderable,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "../types";
import type {
  ForRenderable,
  ShowRenderable,
  SwitchRenderable,
} from "../operators";
import { resolveShowValue, resolveSwitchValue } from "../operators";
import { isAriaAttr } from "../host/attr";
import { isEventProp } from "../host/events";
import { normalizeAttr } from "../host/aliases";
import {
  resolveChildNamespace,
  resolveNamespace,
  type Namespace,
  URL_ATTRS,
} from "../host/namespace";
import { sanitizeURL } from "../host/sanitize";
import { isVoidTag } from "../host/tags";
import { RenderableKind } from "../renderable/kind";
import { wrapHydrationSlotMarkup } from "../renderable/markers";
import type { StyleValue } from "../types";
import { classifyRenderable } from "../renderable/classify";
import {
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  getActiveOwnerContext,
  runComponentRenderable,
  runWithOwnershipNode,
} from "@volynets/reflex-framework";
import { createExecutionDomain } from "@volynets/reflex-runtime/internal";

const PLATFORM_PROPS = new Set<string>([
  "elementInternals",
  "key",
  "ref",
  "shadowAdoptedStyleSheets",
  "shadowChildren",
  "shadowRoot",
  "shadowRootRef",
]);

/** Client-side properties with no content attribute; never serialized. */
const PROPERTY_ONLY_PROPS = new Set<string>([
  "currentTime",
  "defaultPlaybackRate",
  "indeterminate",
  "playbackRate",
  "preservesPitch",
  "scrollLeft",
  "scrollTop",
  "selectedIndex",
  "selectionDirection",
  "selectionEnd",
  "selectionStart",
  "valueAsNumber",
  "volume",
]);

/**
 * Properties that reflect a differently named content attribute. The
 * controlled prop of the same attribute (`value`, `checked`, ...) wins.
 */
const REFLECTED_DEFAULT_PROPS: Record<string, string | undefined> = {
  defaultChecked: "checked",
  defaultMuted: "muted",
  defaultSelected: "selected",
  defaultValue: "value",
};

/** Boolean properties that reflect enumerated attributes, as [true, false]. */
const ENUMERATED_BOOLEAN_PROPS: Record<
  string,
  readonly [string, string] | undefined
> = {
  autocorrect: ["on", "off"],
  draggable: ["true", "false"],
  spellcheck: ["true", "false"],
  translate: ["yes", "no"],
};

interface SelectFrame {
  readonly values: ReadonlySet<string>;
  readonly multiple: boolean;
  matched: boolean;
}

/** The `<select>` whose options are being serialized, if it has a `value`. */
let activeSelect: SelectFrame | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

/**
 * CSS property name for a style key: custom and dashed names are kept, and
 * CSSOM camel-cased (`backgroundColor`), webkit-cased (`webkitLineClamp`)
 * and `cssFloat` names are converted to their dashed form.
 */
function toCSSPropertyName(key: string): string {
  if (key.charCodeAt(0) === 45) return key;
  if (key === "cssFloat") return "float";

  const dashed = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return dashed.startsWith("webkit-") ? `-${dashed}` : dashed;
}

/** `aria-*` attribute name for an ARIA reflection property (`ariaLabel`). */
function toAriaAttributeName(name: string): string | null {
  return name.length > 4 &&
    name.startsWith("aria") &&
    name.charCodeAt(4) >= 65 &&
    name.charCodeAt(4) <= 90
    ? `aria-${name.slice(4).toLowerCase()}`
    : null;
}

function stringifyStyleValue(style: StyleValue): string {
  if (typeof style === "string") {
    return style;
  }

  const entries: string[] = [];
  const styleRecord = style as Record<string, unknown>;

  for (const key in styleRecord) {
    const currentValue = styleRecord[key];

    if (currentValue == null) {
      continue;
    }

    entries.push(`${toCSSPropertyName(key)}:${String(currentValue)}`);
  }

  return entries.join(";");
}

function stringifyNodeValue(node: Node): string {
  if (typeof Element !== "undefined" && node instanceof Element) {
    return node.outerHTML;
  }

  if (typeof Text !== "undefined" && node instanceof Text) {
    return escapeHtml(node.data);
  }

  if (typeof Comment !== "undefined" && node instanceof Comment) {
    return `<!--${node.data}-->`;
  }

  if (
    typeof DocumentFragment !== "undefined" &&
    node instanceof DocumentFragment
  ) {
    let html = "";
    let child = node.firstChild;

    while (child !== null) {
      html += stringifyNodeValue(child);
      child = child.nextSibling;
    }

    return html;
  }

  return "";
}

function resolveServerValue(name: string, value: unknown): unknown {
  if (
    value === undefined ||
    PLATFORM_PROPS.has(name) ||
    isEventProp(name, value)
  ) {
    return undefined;
  }

  if (typeof value === "function" && name !== "children") {
    return (value as () => unknown)();
  }

  return value;
}

function renderAttributes(
  tag: string,
  props: Record<string, unknown>,
  namespace: Namespace,
): string {
  let attributes = "";

  for (const name in props) {
    if (name === "children") {
      continue;
    }

    const resolvedValue = resolveServerValue(name, props[name]);

    if (typeof resolvedValue === "boolean" && isAriaAttr(name)) {
      attributes += ` ${name}="${resolvedValue ? "true" : "false"}"`;
      continue;
    }

    if (namespace !== "svg") {
      const enumerated = ENUMERATED_BOOLEAN_PROPS[name];

      if (enumerated !== undefined && typeof resolvedValue === "boolean") {
        attributes += ` ${name}="${enumerated[resolvedValue ? 0 : 1]}"`;
        continue;
      }
    }

    if (resolvedValue == null || resolvedValue === false) {
      continue;
    }

    if (name === "class" || name === "className") {
      attributes += ` class="${escapeAttribute(String(resolvedValue))}"`;
      continue;
    }

    if (name === "style") {
      const styleText = stringifyStyleValue(resolvedValue as StyleValue);

      if (styleText !== "") {
        attributes += ` style="${escapeAttribute(styleText)}"`;
      }
      continue;
    }

    if (tag === "textarea" && (name === "value" || name === "defaultValue")) {
      continue;
    }

    let attributeName: string;

    if (namespace === "svg") {
      attributeName = normalizeAttr(name);
    } else {
      // `<select>` has no value attribute; options are marked instead.
      if (PROPERTY_ONLY_PROPS.has(name) || (tag === "select" && name === "value")) {
        continue;
      }

      const reflected = REFLECTED_DEFAULT_PROPS[name];

      if (reflected !== undefined) {
        if (resolveServerValue(reflected, props[reflected]) != null) {
          continue;
        }

        attributeName = reflected;
      } else {
        attributeName = toAriaAttributeName(name) ?? normalizeAttr(name);
      }
    }

    const normalizedValue =
      URL_ATTRS.has(attributeName) && typeof resolvedValue === "string"
        ? sanitizeURL(resolvedValue)
        : resolvedValue;

    if (normalizedValue === true) {
      attributes += ` ${attributeName}`;
      continue;
    }

    attributes += ` ${attributeName}="${escapeAttribute(String(normalizedValue))}"`;
  }

  if (namespace === "svg" && tag === "svg" && !("xmlns" in props)) {
    attributes += ` xmlns="http://www.w3.org/2000/svg"`;
  }

  if (namespace === "mathml" && tag === "math" && !("xmlns" in props)) {
    attributes += ` xmlns="http://www.w3.org/1998/Math/MathML"`;
  }

  return attributes;
}

function resolveTextareaContent(props: Record<string, unknown>): string | null {
  const value =
    resolveServerValue("value", props.value) ??
    resolveServerValue("defaultValue", props.defaultValue);

  return value == null ? null : String(value);
}

function resolveForServerValue(
  renderable: ForRenderable<unknown>,
): JSXRenderable {
  const items = renderable.each() ?? [];

  if (items.length === 0) {
    return renderable.fallback;
  }

  return items.map((item, index) => renderable.children(item, index));
}

function renderElementToString(
  renderable: ElementRenderable<ElementTag, Record<string, unknown>>,
  parentNamespace: Namespace,
): string {
  const namespace = resolveNamespace(renderable.tag, parentNamespace);
  const childNamespace = resolveChildNamespace(renderable.tag, namespace);
  const props = renderable.props as Record<string, unknown>;
  let attributes = renderAttributes(renderable.tag, props, namespace);

  if (
    namespace === "html" &&
    renderable.tag === "option" &&
    activeSelect !== null &&
    !/ selected(?:[ =]|$)/.test(attributes) &&
    selectsOption(activeSelect, props)
  ) {
    attributes += " selected";
  }

  if (namespace === "html" && renderable.tag === "select") {
    const previousSelect = activeSelect;
    activeSelect = createSelectFrame(props);

    try {
      const childrenHtml = renderRenderableToString(
        props.children,
        childNamespace,
      );
      return `<select${attributes}>${childrenHtml}</select>`;
    } finally {
      activeSelect = previousSelect;
    }
  }

  if (isVoidTag(renderable.tag)) {
    return `<${renderable.tag}${attributes}>`;
  }

  if (renderable.tag === "textarea") {
    const textareaContent = resolveTextareaContent(props);
    const childrenHtml =
      textareaContent !== null
        ? escapeHtml(textareaContent)
        : renderRenderableToString(props.children, childNamespace);

    return `<${renderable.tag}${attributes}>${childrenHtml}</${renderable.tag}>`;
  }

  const childrenHtml = renderRenderableToString(props.children, childNamespace);
  return `<${renderable.tag}${attributes}>${childrenHtml}</${renderable.tag}>`;
}

/** Mirrors `applyControlledSelectValue` in `host/forms.ts`. */
function createSelectFrame(props: Record<string, unknown>): SelectFrame | null {
  const value = resolveServerValue("value", props.value);

  if (value == null) {
    return null;
  }

  const multiple = resolveServerValue("multiple", props.multiple) === true;
  const values = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : [String(value)];

  return {
    values: new Set(multiple || values[0] !== "" ? values : []),
    multiple,
    matched: false,
  };
}

function collectOptionText(children: unknown): string | null {
  const resolved = resolveServerValue("children", children);

  if (resolved == null || typeof resolved === "boolean") return "";
  if (typeof resolved === "string") return resolved;
  if (typeof resolved === "number" || typeof resolved === "bigint") {
    return String(resolved);
  }

  if (Array.isArray(resolved)) {
    let text = "";

    for (const child of resolved) {
      const childText = collectOptionText(child);
      if (childText === null) return null;
      text += childText;
    }

    return text;
  }

  return null;
}

/** An option's value: its `value`, else its text with whitespace collapsed. */
function resolveOptionValue(props: Record<string, unknown>): string | null {
  const value = resolveServerValue("value", props.value);

  if (value != null) {
    return String(value);
  }

  const text = collectOptionText(props.children);
  return text === null
    ? null
    : text.replace(/[\t\n\f\r ]+/g, " ").trim();
}

function selectsOption(
  frame: SelectFrame,
  props: Record<string, unknown>,
): boolean {
  if (!frame.multiple && frame.matched) {
    return false;
  }

  const optionValue = resolveOptionValue(props);

  if (optionValue === null || !frame.values.has(optionValue)) {
    return false;
  }

  frame.matched = true;
  return true;
}

function renderDynamicSlot(
  value: JSXRenderable | unknown,
  namespace: Namespace,
): string {
  return wrapHydrationSlotMarkup(renderRenderableToString(value, namespace));
}

function renderRenderableToString(
  value: JSXRenderable | unknown,
  parentNamespace: Namespace,
): string {
  switch (classifyRenderable(value)) {
    case RenderableKind.Empty:
      return "";

    case RenderableKind.Array: {
      const items = Array.isArray(value)
        ? value
        : Array.from(value as Iterable<unknown>);

      let html = "";

      for (let index = 0; index < items.length; index++) {
        html += renderRenderableToString(items[index], parentNamespace);
      }

      return html;
    }

    case RenderableKind.Text:
      return escapeHtml(String(value));

    case RenderableKind.Node:
      return stringifyNodeValue(value as Node);

    case RenderableKind.Accessor:
      return renderDynamicSlot((value as () => unknown)(), parentNamespace);

    case RenderableKind.Show: {
      const renderable = value as ShowRenderable<unknown>;
      return renderDynamicSlot(
        resolveShowValue(renderable, renderable.when()),
        parentNamespace,
      );
    }

    case RenderableKind.Switch: {
      const renderable = value as SwitchRenderable<unknown>;
      return renderDynamicSlot(
        resolveSwitchValue(renderable, renderable.value()),
        parentNamespace,
      );
    }

    case RenderableKind.For:
      return renderDynamicSlot(
        resolveForServerValue(value as ForRenderable<unknown>),
        parentNamespace,
      );

    case RenderableKind.Portal:
      return "";

    case RenderableKind.Component: {
      const renderable = value as ComponentRenderable<unknown>;
      return runComponentRenderable(
        renderable,
        { owner: getActiveOwnerContext()! },
        (result) => renderRenderableToString(result, parentNamespace),
      );
    }

    case RenderableKind.Element:
      return renderElementToString(
        value as ElementRenderable<ElementTag, Record<string, unknown>>,
        parentNamespace,
      );
  }
}

/**
 * Serializes a renderable tree to server HTML with markers understood by
 * `hydrate`.
 *
 * @remarks
 * **When to use:** to create SSR markup before sending HTML to the client for
 * hydration.
 * **When not to use:** to mutate browser DOM or produce static HTML without
 * client markers; this renderer is designed for the SSR/hydration pair.
 *
 * @param renderable The root renderable value.
 */
export function renderToString(renderable: JSXRenderable): string {
  // Each request renders in its own execution domain. Closing it at the end
  // disposes request-scoped work, including pending async sources.
  const domain = createExecutionDomain();
  const owner = createOwnerContext(domain);
  const root = createOwnershipNode();

  try {
    return domain.run(() =>
      runWithOwnershipNode(owner, root, () =>
        renderRenderableToString(renderable, "html"),
      ),
    );
  } finally {
    try {
      domain.run(() => disposeOwnershipNode(root));
    } finally {
      domain.close();
    }
  }
}
