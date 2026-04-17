import type {
  Cleanup,
  ComponentRenderable,
  ElementProps,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "./types";
import type {
  ForRenderable,
  PortalRenderable,
  ShowRenderable,
  SwitchRenderable,
} from "./operators";
import {
  resolveShowValue,
  resolveSwitchValue,
} from "./operators";
import { RenderableKind } from "./renderable-kind";
import { classifyClientRenderable } from "./mount/renderable";
import { bindElementProps } from "./mount/element-binder";
import { hydrateReactiveSlot } from "./structure/reactive-slot";
import { mountPortal } from "./mount/portal";
import type { DOMRenderer } from "./runtime";
import {
  adoptExistingContentRange,
  createRenderRangeMount,
  mountRenderRange,
  type MountedRenderRange,
} from "./structure/render-range";
import {
  isHydrationSlotEnd,
  isHydrationSlotStart,
} from "./hydrate/markers";
import { createScope } from "@volynets/reflex-framework/ownership";
import { runInOwnershipScope } from "@volynets/reflex-framework/ownership/reflex";
import { resolveNamespace, SVG_NS, MATHML_NS, type Namespace } from "./host/namespace";

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
  renderer: DOMRenderer,
  container: ParentNode & Node,
  rootMount: MountedRenderRange,
): Cleanup {
  const dispose = (() => {
    rootMount.clear();

    if (renderer.mountedRoots.get(container) !== rootMount) {
      return;
    }

    renderer.mountedRoots.delete(container);
    rootMount.destroy();
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
  return !(
    tag === "textarea" &&
    ("value" in props || "defaultValue" in props)
  );
}

function hydrateRenderableValue(
  renderer: DOMRenderer,
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
          renderer,
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
        renderer,
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
        renderer,
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
        renderer,
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
        renderer,
        renderable.each,
        (resolvedValue) => resolveForHydrationValue(renderable, resolvedValue),
        slot.start,
        slot.end,
        parentNamespace,
      );
      return slot.next;
    }

    case RenderableKind.Portal:
      mountPortal(renderer, value as PortalRenderable);
      return currentNode;

    case RenderableKind.Component: {
      const renderable = value as ComponentRenderable<unknown>;
      return hydrateRenderableValue(
        renderer,
        renderable.type(renderable.props),
        parentNamespace,
        currentNode,
        boundary,
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
      const elementNamespace = resolveNamespace(renderable.tag, parentNamespace);

      if (!matchesHydratedElement(currentNode, renderable.tag, elementNamespace)) {
        failHydration();
      }

      const props = renderable.props as Record<string, unknown>;
      bindElementProps(renderer, currentNode, props, elementNamespace, "initial");

      if (shouldHydrateLightDomChildren(renderable.tag, props)) {
        const remainingChild = hydrateRenderableValue(
          renderer,
          props.children,
          elementNamespace,
          currentNode.firstChild,
          null,
        );

        if (remainingChild !== null) {
          failHydration();
        }
      }

      bindElementProps(renderer, currentNode, props, elementNamespace, "deferred");

      return nextSiblingWithinBoundary(currentNode, boundary);
    }

    case RenderableKind.Node:
      failHydration();
  }
}

function hydrateManagedContainer(
  renderer: DOMRenderer,
  renderable: JSXRenderable,
  container: ParentNode & Node,
): MountedRenderRange {
  const anchors = adoptExistingContentRange(container);
  const scope = createScope();

  try {
    runInOwnershipScope(renderer.owner, scope, () => {
      const remainingNode = hydrateRenderableValue(
        renderer,
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

    return createRenderRangeMount(scope, anchors);
  } catch (error) {
    const failedHydrationMount = createRenderRangeMount(scope, anchors);
    failedHydrationMount.clear();

    if (!(error instanceof HydrationMismatch)) {
      throw error;
    }

    return mountRenderRange(renderer, container, renderable, "html", anchors);
  }
}

export function resumeWithRenderer(
  renderer: DOMRenderer,
  container: ParentNode & Node,
): Cleanup {
  renderer.ensureRuntime();

  const currentRoot = renderer.mountedRoots.get(container);
  if (currentRoot !== undefined) {
    return createRootCleanup(renderer, container, currentRoot);
  }

  const resumedRoot = createRenderRangeMount(
    createScope(),
    adoptExistingContentRange(container),
  );

  renderer.mountedRoots.set(container, resumedRoot);
  return createRootCleanup(renderer, container, resumedRoot);
}

export function hydrateWithRenderer(
  renderer: DOMRenderer,
  renderable: JSXRenderable,
  container: ParentNode & Node,
): Cleanup {
  renderer.ensureRuntime();

  const existingRoot = renderer.mountedRoots.get(container);
  if (existingRoot !== undefined) {
    existingRoot.destroy();
    renderer.mountedRoots.delete(container);
  }

  const hydratedRoot = hydrateManagedContainer(renderer, renderable, container);
  renderer.mountedRoots.set(container, hydratedRoot);
  return createRootCleanup(renderer, container, hydratedRoot);
}
