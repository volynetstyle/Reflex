import { isTextNode, isElementNode } from "../host/document";
import type {
  ComponentRenderable,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "../types";
import type {
  ForRenderable,
  PortalRenderable,
  ShowRenderable,
  SwitchRenderable,
} from "../operators";
import { resolveShowValue, resolveSwitchValue } from "../operators";
import { RenderableKind } from "../renderable/kind";
import type { CompiledDOMRenderable } from "../renderable/compiled";
import { classifyRenderable } from "../renderable/classify";
import { bindElementProps } from "../mount/element-binder";
import { appendRenderableNodes } from "../mount/append";
import { hasContentProp, isTextOnlyElement } from "../host/content";
import { isTextRenderableValue } from "../renderable/kind";
import { hydrateReactiveSlot, type HydrateContent } from "../mount/slot";
import { hydrateFor } from "../mount/for";
import { mountPortal } from "../mount/portal";
import { mountOwnedRange } from "../mount/range";
import {
  type RangeAnchors,
  createOwnedRange,
  type OwnedRange,
} from "../structure/owned-range";
import { consumeHydrationSlot } from "./slots";
import { HydrationMismatch, failHydration } from "./error";
import { nextSiblingWithinBoundary } from "./cursor";
import {
  createOwnershipNode,
  runComponentRenderable,
} from "@volynets/reflex-framework";
import { getDOMContext } from "../runtime/context";
import { runInDOMOwnershipNode } from "../runtime/lifetime";
import {
  resolveChildNamespace,
  resolveContainerNamespace,
  resolveNamespace,
  SVG_NS,
  MATHML_NS,
  type Namespace,
} from "../host/namespace";

function identity<T>(value: T): T {
  return value;
}

/** Dynamic slot content hydrates recursively, so nested handlers and components activate. */
const hydrateSlotContent: HydrateContent = (value, first, boundary, ns) => {
  if (
    hydrateRenderableValue(value, ns, first, boundary, boundary.ownerDocument!) !==
    null
  ) {
    failHydration();
  }
};

function expectedNamespaceUri(namespace: Namespace): string | null {
  switch (namespace) {
    case "svg":
      return SVG_NS;
    case "mathml":
      return MATHML_NS;
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}

function matchesHydratedElement(
  element: Element,
  tag: string,
  namespace: Namespace,
): boolean {
  return (
    element.localName === tag &&
    element.namespaceURI === expectedNamespaceUri(namespace)
  );
}

function shouldHydrateLightDomChildren(
  tag: ElementTag,
  props: Record<string, unknown>,
): boolean {
  return !(tag === "textarea" && ("value" in props || "defaultValue" in props));
}

/**
 * Children that are mounted again instead of adopted: after a content prop
 * (`innerHTML`, ...) has replaced the server content, and in text-only
 * elements, whose server text carries no hydration markers. As in
 * `mountElement`, a static scalar child replaces the content and other
 * children are appended to it.
 */
function remountElementChildren(
  element: Element,
  props: Record<string, unknown>,
  childNamespace: Namespace,
  replacesContent: boolean,
  doc: Document,
): void {
  const children = props.children;

  if (isTextRenderableValue(children)) {
    const text = String(children);
    if (element.textContent !== text) element.textContent = text;
    return;
  }

  if (!replacesContent) element.textContent = "";
  appendRenderableNodes(element, children, childNamespace, doc);
}

function hydrateRenderableValue(
  value: JSXRenderable | unknown,
  parentNamespace: Namespace,
  currentNode: Node | null,
  boundary: Node | null,
  doc: Document,
): Node | null {
  switch (classifyRenderable(value)) {
    case RenderableKind.Empty:
      return currentNode;

    case RenderableKind.Array: {
      const items = Array.isArray(value)
        ? value
        : Array.from(value as Iterable<unknown>);

      let cursor = currentNode;

      for (let index = 0; index < items.length; index++) {
        cursor = hydrateRenderableValue(
          items[index],
          parentNamespace,
          cursor,
          boundary,
          doc,
        );
      }

      return cursor;
    }

    case RenderableKind.Text: {
      if (!isTextNode(currentNode)) {
        failHydration();
      }

      const nextValue = String(value);
      if (currentNode.data !== nextValue) {
        currentNode.data = nextValue;
      }

      return nextSiblingWithinBoundary(currentNode, boundary);
    }

    case RenderableKind.Accessor: {
      const slot = consumeHydrationSlot(currentNode, boundary);
      hydrateReactiveSlot(
        value as () => unknown,
        identity,
        slot.start,
        slot.end,
        parentNamespace,
        hydrateSlotContent,
      );
      return slot.next;
    }

    case RenderableKind.Show: {
      const renderable = value as ShowRenderable<unknown>;
      const slot = consumeHydrationSlot(currentNode, boundary);
      hydrateReactiveSlot(
        renderable.when,
        (resolvedValue) => resolveShowValue(renderable, resolvedValue),
        slot.start,
        slot.end,
        parentNamespace,
        hydrateSlotContent,
        renderable.ref,
      );
      return slot.next;
    }

    case RenderableKind.Switch: {
      const renderable = value as SwitchRenderable<unknown>;
      const slot = consumeHydrationSlot(currentNode, boundary);
      hydrateReactiveSlot(
        renderable.value,
        (resolvedValue) => resolveSwitchValue(renderable, resolvedValue),
        slot.start,
        slot.end,
        parentNamespace,
        hydrateSlotContent,
      );
      return slot.next;
    }

    case RenderableKind.For: {
      const slot = consumeHydrationSlot(currentNode, boundary);
      hydrateFor(
        value as ForRenderable<unknown>,
        parentNamespace,
        slot.start,
        slot.end,
        hydrateSlotContent,
      );
      return slot.next;
    }

    case RenderableKind.Portal:
      mountPortal(value as PortalRenderable, doc);
      return currentNode;

    case RenderableKind.Component: {
      const renderable = value as ComponentRenderable<unknown>;
      const context = getDOMContext();

      return runComponentRenderable(
        renderable,
        { owner: context.owner },
        (result) =>
          hydrateRenderableValue(
            result,
            parentNamespace,
            currentNode,
            boundary,
            doc,
          ),
      );
    }

    case RenderableKind.Element: {
      if (!isElementNode(currentNode)) {
        failHydration();
      }

      const renderable = value as ElementRenderable<ElementTag, Record<string, unknown>>;
      const elementNamespace = resolveNamespace(
        renderable.tag,
        parentNamespace,
      );

      if (
        !matchesHydratedElement(currentNode, renderable.tag, elementNamespace)
      ) {
        failHydration();
      }

      const props = renderable.props as Record<string, unknown>;
      const childNamespace = resolveChildNamespace(
        renderable.tag,
        elementNamespace,
      );
      const replacesContent = hasContentProp(props, elementNamespace);
      bindElementProps(currentNode, props, elementNamespace, "initial");

      if (!shouldHydrateLightDomChildren(renderable.tag, props)) {
        // The value props own the textarea content.
      } else if (
        replacesContent ||
        isTextOnlyElement(renderable.tag, elementNamespace)
      ) {
        remountElementChildren(
          currentNode,
          props,
          childNamespace,
          replacesContent,
          doc,
        );
      } else {
        const remainingChild = hydrateRenderableValue(
          props.children,
          childNamespace,
          currentNode.firstChild,
          null,
          doc,
        );

        if (remainingChild !== null) {
          failHydration();
        }
      }

      bindElementProps(currentNode, props, elementNamespace, "deferred");

      return nextSiblingWithinBoundary(currentNode, boundary);
    }

    case RenderableKind.Node:
      failHydration();

    // Hydration adopts server nodes instead of creating them, so a compiled
    // region hydrates through its source tree.
    case RenderableKind.Compiled:
      return hydrateRenderableValue(
        (value as CompiledDOMRenderable).fallback(),
        parentNamespace,
        currentNode,
        boundary,
        doc,
      );
  }
}

export function hydrateRange(
  renderable: JSXRenderable,
  container: ParentNode & Node,
  anchors: RangeAnchors,
): OwnedRange {
  const ownershipNode = createOwnershipNode();

  try {
    runInDOMOwnershipNode(ownershipNode, () => {
      const remainingNode = hydrateRenderableValue(
        renderable,
        resolveContainerNamespace(container),
        anchors.startAnchor.nextSibling === anchors.endAnchor
          ? null
          : anchors.startAnchor.nextSibling,
        anchors.endAnchor,
        anchors.startAnchor.ownerDocument,
      );

      if (remainingNode !== null) {
        failHydration();
      }
    });

    return createOwnedRange(ownershipNode, anchors);
  } catch (error) {
    const failedHydrationMount = createOwnedRange(ownershipNode, anchors);
    failedHydrationMount.clear();

    if (!(error instanceof HydrationMismatch)) {
      failedHydrationMount.destroy();
      throw error;
    }

    return mountOwnedRange(
      container,
      renderable,
      resolveContainerNamespace(container),
      anchors,
    );
  }
}
