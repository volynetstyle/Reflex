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
  createScope,
  disposeScope,
  registerCleanup,
} from "reflex-framework/ownership";
import {
  onEffectStart,
  runInOwnershipScope,
  useEffect,
} from "reflex-framework/ownership/reflex";
import { bindElementProps } from "./element-binder";
import { appendRenderableNodes } from "./append";

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

function applyAdoptedStyleSheets(
  root: ShadowRoot,
  value: unknown,
): unknown {
  if (!("adoptedStyleSheets" in root)) {
    return value;
  }

  (root as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] })
    .adoptedStyleSheets =
      value == null
        ? []
        : Array.isArray(value)
          ? [...value]
          : Array.from(value as Iterable<CSSStyleSheet>);
  return value;
}

export function mountElement<Tag extends ElementTag>(
  renderer: DOMRenderer,
  tag: Tag,
  props: ElementProps<Tag>,
  parentNamespace: Namespace,
): ElementInstance<Tag> {
  const ns = resolveNamespace(tag, parentNamespace);
  const doc = document;
  const el = (
    ns === "svg"
      ? doc.createElementNS(SVG_NS, tag)
      : ns === "mathml"
        ? doc.createElementNS(MATHML_NS, tag)
      : doc.createElement(tag)
  ) as unknown as ElementInstance<Tag>;
  const rawProps = props as Record<string, unknown>;
  const shadowConfig = resolveShadowRootConfig(rawProps);
  const shadowRoot =
    shadowConfig !== null && el instanceof HTMLElement
      ? (el.shadowRoot ?? el.attachShadow(shadowConfig))
      : null;

  bindElementProps(renderer, el, rawProps, ns, "initial");

  const shouldMountLightChildren = !(
    tag === "textarea" &&
    ("value" in rawProps || "defaultValue" in rawProps)
  );

  if (shouldMountLightChildren) {
    appendRenderableNodes(renderer, el, rawProps.children, ns);
  }

  bindElementProps(renderer, el, rawProps, ns, "deferred");

  if (shadowRoot !== null) {
    if (rawProps.shadowRootRef !== undefined) {
      registerCleanup(
        renderer.owner,
        attachRef(shadowRoot, rawProps.shadowRootRef as Ref<ShadowRoot> | undefined),
      );
    }

    if (rawProps.shadowChildren !== undefined) {
      const shadowScope = createScope();

      runInOwnershipScope(renderer.owner, shadowScope, () => {
        appendRenderableNodes(renderer, shadowRoot, rawProps.shadowChildren, "html");
      });

      registerCleanup(renderer.owner, () => {
        disposeScope(shadowScope);
        shadowRoot.replaceChildren();
      });
    }

    if (rawProps.shadowAdoptedStyleSheets !== undefined) {
      if (typeof rawProps.shadowAdoptedStyleSheets === "function") {
        applyAdoptedStyleSheets(
          shadowRoot,
          (rawProps.shadowAdoptedStyleSheets as () => unknown)(),
        );

        useEffect(renderer.owner, () => {
          const nextValue = (rawProps.shadowAdoptedStyleSheets as () => unknown)();

          onEffectStart(() => {
            applyAdoptedStyleSheets(shadowRoot, nextValue);
          });
        });
      } else {
        applyAdoptedStyleSheets(shadowRoot, rawProps.shadowAdoptedStyleSheets);
      }
    }
  }

  if (
    rawProps.elementInternals !== undefined &&
    el instanceof HTMLElement &&
    typeof el.attachInternals === "function"
  ) {
    try {
      const internals = el.attachInternals();
      registerCleanup(
        renderer.owner,
        attachRef(
          internals,
          rawProps.elementInternals as Ref<ElementInternals> | undefined,
        ),
      );
    } catch {
      // Only autonomous custom elements can attach internals.
    }
  }

  return el;
}
