import type {
  ComponentRenderable,
  ElementProps,
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
import { isEventProp } from "../host/events";
import { normalizeAttr } from "../host/aliases";
import { resolveNamespace, type Namespace, URL_ATTRS } from "../host/namespace";
import { sanitizeURL } from "../host/sanitize";
import { isVoidTag } from "../host/tags";
import { RenderableKind } from "../renderable/kind";
import { wrapHydrationSlotMarkup } from "../hydrate/markers";
import type { StyleValue } from "../types";
import { classifyServerRenderable } from "./renderable";
import { runWithComponentHooks } from "@volynets/reflex-framework";

const PLATFORM_PROPS = new Set<string>([
  "elementInternals",
  "key",
  "ref",
  "shadowAdoptedStyleSheets",
  "shadowChildren",
  "shadowRoot",
  "shadowRootRef",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
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

    const cssName =
      key.charCodeAt(0) === 45 && key.charCodeAt(1) === 45
        ? key
        : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

    entries.push(`${cssName}:${String(currentValue)}`);
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

  if (typeof DocumentFragment !== "undefined" && node instanceof DocumentFragment) {
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
  if (value === undefined || PLATFORM_PROPS.has(name) || isEventProp(name, value)) {
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

    const attributeName = normalizeAttr(name);
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
  const value = resolveServerValue("value", props.value) ??
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
  renderable: ElementRenderable<ElementTag, ElementProps<ElementTag>>,
  parentNamespace: Namespace,
): string {
  const namespace = resolveNamespace(renderable.tag, parentNamespace);
  const props = renderable.props as Record<string, unknown>;
  const attributes = renderAttributes(renderable.tag, props, namespace);

  if (isVoidTag(renderable.tag)) {
    return `<${renderable.tag}${attributes}>`;
  }

  if (renderable.tag === "textarea") {
    const textareaContent = resolveTextareaContent(props);
    const childrenHtml =
      textareaContent !== null
        ? escapeHtml(textareaContent)
        : renderRenderableToString(props.children, namespace);

    return `<${renderable.tag}${attributes}>${childrenHtml}</${renderable.tag}>`;
  }

  const childrenHtml = renderRenderableToString(props.children, namespace);
  return `<${renderable.tag}${attributes}>${childrenHtml}</${renderable.tag}>`;
}

function renderDynamicSlot(value: JSXRenderable | unknown, namespace: Namespace): string {
  return wrapHydrationSlotMarkup(renderRenderableToString(value, namespace));
}

function renderRenderableToString(
  value: JSXRenderable | unknown,
  parentNamespace: Namespace,
): string {
  switch (classifyServerRenderable(value)) {
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
      return renderRenderableToString(
        runWithComponentHooks(
          { renderEffectScheduler: null },
          () => renderable.type(renderable.props),
        ),
        parentNamespace,
      );
    }

    case RenderableKind.Element:
      return renderElementToString(
        value as ElementRenderable<ElementTag, ElementProps<ElementTag>>,
        parentNamespace,
      );
  }
}

export function renderToString(renderable: JSXRenderable): string {
  return renderRenderableToString(renderable, "html");
}
