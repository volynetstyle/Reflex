import type {
  ElementInstance,
  ElementProps,
  ElementTag,
  Ref,
} from "../types";
import type { DOMRenderer } from "../runtime";
import { attachRef } from "../host/refs";
import {
  MATHML_NS,
  SVG_NS,
  resolveNamespace,
  type Namespace,
} from "../host/namespace";
import {
  registerCleanup,
} from "reflex-framework/ownership";
import {
  onEffectStart,
  useEffect,
} from "reflex-framework/ownership/reflex";
import { mountRenderRange } from "../structure/render-range";
import { bindElementProps } from "./element-binder";
import { appendRenderableNodes } from "./append";

function createElementInNamespace<Tag extends ElementTag>(
  tag: Tag,
  namespace: Namespace,
): ElementInstance<Tag> {
  const ownerDocument = document;

  return (
    namespace === "svg"
      ? ownerDocument.createElementNS(SVG_NS, tag)
      : namespace === "mathml"
        ? ownerDocument.createElementNS(MATHML_NS, tag)
      : ownerDocument.createElement(tag)
  ) as unknown as ElementInstance<Tag>;
}

function resolveShadowRootConfig(
  props: Record<string, unknown>,
): ShadowRootInit | null {
  const requested = props.shadowRoot ??
    (props.shadowChildren !== undefined ||
    props.shadowAdoptedStyleSheets !== undefined ||
    props.shadowRootRef !== undefined
      ? true
      : undefined);

  if (requested === true) {
    return { mode: "open" };
  }

  if (
    typeof requested === "object" &&
    requested !== null &&
    "mode" in requested
  ) {
    return requested as ShadowRootInit;
  }

  return null;
}

function resolveElementShadowRoot(
  hostElement: Element,
  props: Record<string, unknown>,
): ShadowRoot | null {
  const shadowRootConfig = resolveShadowRootConfig(props);

  if (shadowRootConfig === null || !(hostElement instanceof HTMLElement)) {
    return null;
  }

  return hostElement.shadowRoot ?? hostElement.attachShadow(shadowRootConfig);
}

function applyShadowRootAdoptedStyleSheets(
  shadowRoot: ShadowRoot,
  value: unknown,
): unknown {
  if (!("adoptedStyleSheets" in shadowRoot)) {
    return value;
  }

  (shadowRoot as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] })
    .adoptedStyleSheets =
      value == null
        ? []
        : Array.isArray(value)
          ? [...value]
          : Array.from(value as Iterable<CSSStyleSheet>);
  return value;
}

function shouldMountLightDomChildren(
  tag: ElementTag,
  props: Record<string, unknown>,
): boolean {
  return !(
    tag === "textarea" &&
    ("value" in props || "defaultValue" in props)
  );
}

function bindShadowRootReference(
  renderer: DOMRenderer,
  shadowRoot: ShadowRoot,
  shadowRootRef: unknown,
): void {
  registerCleanup(
    renderer.owner,
    attachRef(shadowRoot, shadowRootRef as Ref<ShadowRoot> | undefined),
  );
}

function mountShadowRootChildren(
  renderer: DOMRenderer,
  shadowRoot: ShadowRoot,
  shadowChildren: unknown,
): void {
  const shadowRenderRange = mountRenderRange(
    renderer,
    shadowRoot,
    shadowChildren,
    "html",
  );

  registerCleanup(renderer.owner, () => {
    shadowRenderRange.destroy();
  });
}

function bindReactiveAdoptedStyleSheets(
  renderer: DOMRenderer,
  shadowRoot: ShadowRoot,
  getNextStyleSheets: () => unknown,
): void {
  applyShadowRootAdoptedStyleSheets(shadowRoot, getNextStyleSheets());

  useEffect(renderer.owner, () => {
    const nextStyleSheets = getNextStyleSheets();

    onEffectStart(() => {
      applyShadowRootAdoptedStyleSheets(shadowRoot, nextStyleSheets);
    });
  });
}

function bindShadowRootAdoptedStyleSheets(
  renderer: DOMRenderer,
  shadowRoot: ShadowRoot,
  adoptedStyleSheets: unknown,
): void {
  if (typeof adoptedStyleSheets === "function") {
    bindReactiveAdoptedStyleSheets(
      renderer,
      shadowRoot,
      adoptedStyleSheets as () => unknown,
    );
    return;
  }

  applyShadowRootAdoptedStyleSheets(shadowRoot, adoptedStyleSheets);
}

function bindElementInternalsReference(
  renderer: DOMRenderer,
  hostElement: Element,
  elementInternalsRef: unknown,
): void {
  if (
    !(hostElement instanceof HTMLElement) ||
    typeof hostElement.attachInternals !== "function"
  ) {
    return;
  }

  try {
    const elementInternals = hostElement.attachInternals();
    registerCleanup(
      renderer.owner,
      attachRef(
        elementInternals,
        elementInternalsRef as Ref<ElementInternals> | undefined,
      ),
    );
  } catch {
    // Only autonomous custom elements can attach internals.
  }
}

export function mountElement<Tag extends ElementTag>(
  renderer: DOMRenderer,
  tag: Tag,
  props: ElementProps<Tag>,
  parentNamespace: Namespace,
): ElementInstance<Tag> {
  const elementNamespace = resolveNamespace(tag, parentNamespace);
  const element = createElementInNamespace(tag, elementNamespace);
  const propsRecord = props as Record<string, unknown>;
  const shadowRoot = resolveElementShadowRoot(element, propsRecord);

  bindElementProps(renderer, element, propsRecord, elementNamespace, "initial");

  if (shouldMountLightDomChildren(tag, propsRecord)) {
    appendRenderableNodes(
      renderer,
      element,
      propsRecord.children,
      elementNamespace,
    );
  }

  bindElementProps(renderer, element, propsRecord, elementNamespace, "deferred");

  if (shadowRoot !== null) {
    if (propsRecord.shadowRootRef !== undefined) {
      bindShadowRootReference(renderer, shadowRoot, propsRecord.shadowRootRef);
    }

    if (propsRecord.shadowChildren !== undefined) {
      mountShadowRootChildren(renderer, shadowRoot, propsRecord.shadowChildren);
    }

    if (propsRecord.shadowAdoptedStyleSheets !== undefined) {
      bindShadowRootAdoptedStyleSheets(
        renderer,
        shadowRoot,
        propsRecord.shadowAdoptedStyleSheets,
      );
    }
  }

  if (propsRecord.elementInternals !== undefined) {
    bindElementInternalsReference(
      renderer,
      element,
      propsRecord.elementInternals,
    );
  }

  return element;
}
