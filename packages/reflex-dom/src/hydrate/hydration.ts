import { isTextNode, isElementNode } from "../host/document";
import type {
  ComponentRenderable,
  ElementProps,
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
import { classifyRenderable } from "../renderable/classify";
import { bindElementProps } from "../mount/element-binder";
import { hydrateReactiveSlot } from "../mount/slot";
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
  resolveNamespace,
  SVG_NS,
  MATHML_NS,
  type Namespace,
} from "../host/namespace";

function identity<T>(value: T): T {
  return value;
}

function resolveForHydrationValue(
  renderable: ForRenderable<unknown>,
  items: readonly unknown[] | null | undefined,
): JSXRenderable {
  const nextItems = items ?? [];

  if (nextItems.length === 0) {
    return renderable.fallback;
  }

  return nextItems.map((item, index) => renderable.children(item, index));
}

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
      );
      return slot.next;
    }

    case RenderableKind.For: {
      const renderable = value as ForRenderable<unknown>;
      const slot = consumeHydrationSlot(currentNode, boundary);
      hydrateReactiveSlot(
        renderable.each,
        (resolvedValue) => resolveForHydrationValue(renderable, resolvedValue),
        slot.start,
        slot.end,
        parentNamespace,
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

      const renderable = value as ElementRenderable<
        ElementTag,
        ElementProps<ElementTag>
      >;
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
      bindElementProps(currentNode, props, elementNamespace, "initial");

      if (shouldHydrateLightDomChildren(renderable.tag, props)) {
        const remainingChild = hydrateRenderableValue(
          props.children,
          elementNamespace,
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
        "html",
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

    return mountOwnedRange(container, renderable, "html", anchors);
  }
}
