import type {
  Cleanup,
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
import { classifyClientRenderable } from "../mount/renderable";
import { bindElementProps } from "../mount/element-binder";
import { hydrateReactiveSlot } from "../structure/reactive-slot";
import { mountPortal } from "../mount/portal";
import {
  adoptExistingContentRange,
  createRenderRangeMount,
  mountRenderRange,
  type MountedRenderRange,
} from "../structure/render-range";
import { isHydrationSlotEnd, isHydrationSlotStart } from "../hydrate/markers";
import {
  createOwnershipNode,
  runComponentRenderable,
} from "@volynets/reflex-framework";
import {
  getActiveDOMExecutionContext,
  runInDOMOwnershipNode,
  runWithDOMExecutionContext,
} from "../runtime/execution";
import {
  resolveNamespace,
  SVG_NS,
  MATHML_NS,
  type Namespace,
} from "../host/namespace";

class HydrationMismatch extends Error {}

function identity<T>(value: T): T {
  return value;
}

function failHydration(): never {
  throw new HydrationMismatch();
}

function nextSiblingWithinBoundary(
  node: Node,
  boundary: Node | null,
): Node | null {
  const nextNode = node.nextSibling;
  return nextNode === boundary ? null : nextNode;
}

function createRootCleanup(
  container: ParentNode & Node,
  rootMount: MountedRenderRange,
): Cleanup {
  const context = getActiveDOMExecutionContext();

  const dispose = (() => {
    runWithDOMExecutionContext(context, () => {
      rootMount.clear();

      if (context.mountedRoots.get(container) !== rootMount) {
        return;
      }

      context.mountedRoots.unset(container);
      rootMount.destroy();
    });
  }) as Cleanup;

  dispose.dispose = dispose;
  return dispose;
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

function consumeHydrationSlot(
  currentNode: Node | null,
  boundary: Node | null,
): {
  start: Comment;
  end: Comment;
  next: Node | null;
} {
  if (!isHydrationSlotStart(currentNode)) {
    failHydration();
  }

  let depth = 1;
  let cursor = currentNode.nextSibling;

  while (cursor !== null && cursor !== boundary) {
    if (isHydrationSlotStart(cursor)) {
      depth++;
    } else if (isHydrationSlotEnd(cursor)) {
      depth--;

      if (depth === 0) {
        return {
          start: currentNode,
          end: cursor,
          next: nextSiblingWithinBoundary(cursor, boundary),
        };
      }
    }

    cursor = cursor.nextSibling;
  }

  failHydration();
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
): Node | null {
  switch (classifyClientRenderable(value)) {
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
        );
      }

      return cursor;
    }

    case RenderableKind.Text: {
      if (!(currentNode instanceof Text)) {
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
      mountPortal(value as PortalRenderable);
      return currentNode;

    case RenderableKind.Component: {
      const renderable = value as ComponentRenderable<unknown>;
      const context = getActiveDOMExecutionContext();

      return runComponentRenderable(
        renderable,
        {
          owner: context.owner,
          renderEffectScheduler: context.renderEffectScheduler,
        },
        (result) =>
          hydrateRenderableValue(
            result,
            parentNamespace,
            currentNode,
            boundary,
          ),
      );
    }

    case RenderableKind.Element: {
      if (!(currentNode instanceof Element)) {
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
      bindElementProps(
        currentNode,
        props,
        elementNamespace,
        "initial",
      );

      if (shouldHydrateLightDomChildren(renderable.tag, props)) {
        const remainingChild = hydrateRenderableValue(
          props.children,
          elementNamespace,
          currentNode.firstChild,
          null,
        );

        if (remainingChild !== null) {
          failHydration();
        }
      }

      bindElementProps(
        currentNode,
        props,
        elementNamespace,
        "deferred",
      );

      return nextSiblingWithinBoundary(currentNode, boundary);
    }

    case RenderableKind.Node:
      failHydration();
  }
}

function hydrateManagedContainer(
  renderable: JSXRenderable,
  container: ParentNode & Node,
): MountedRenderRange {
  const anchors = adoptExistingContentRange(container);
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
      );

      if (remainingNode !== null) {
        failHydration();
      }
    });

    return createRenderRangeMount(ownershipNode, anchors);
  } catch (error) {
    const failedHydrationMount = createRenderRangeMount(ownershipNode, anchors);
    failedHydrationMount.clear();

    if (!(error instanceof HydrationMismatch)) {
      throw error;
    }

    return mountRenderRange(container, renderable, "html", anchors);
  }
}

export function resumeWithDOMExecution(
  container: ParentNode & Node,
): Cleanup {
  const context = getActiveDOMExecutionContext();

  const currentRoot = context.mountedRoots.get(container);
  if (currentRoot !== undefined) {
    return createRootCleanup(container, currentRoot);
  }

  const resumedRoot = createRenderRangeMount(
    createOwnershipNode(),
    adoptExistingContentRange(container),
  );

  context.mountedRoots.set(container, resumedRoot);
  return createRootCleanup(container, resumedRoot);
}

export function hydrateWithDOMExecution(
  renderable: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  const context = getActiveDOMExecutionContext();

  const existingRoot = context.mountedRoots.get(container);
  if (existingRoot !== undefined) {
    existingRoot.destroy();
    context.mountedRoots.unset(container);
  }

  const hydratedRoot = hydrateManagedContainer(renderable, container);
  context.mountedRoots.set(container, hydratedRoot);
  context.renderEffectScheduler.flush();
  return createRootCleanup(container, hydratedRoot);
}
