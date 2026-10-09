export type DOMBoundary = Text | Comment;

/** Validate before doing anything observable: reversed ranges must be empty. */
export function firstRangeNode(
  start: DOMBoundary,
  end: DOMBoundary,
): Node | null {
  const parent = start.parentNode;
  if (parent === null || end.parentNode !== parent) return null;
  const first = start.nextSibling;
  if (first === null || first === end) return null;
  // Numeric constants also work for anchors from another window.
  return start.compareDocumentPosition(end) & 4 ? first : null;
}

export function snapshotRangeNodes(
  start: DOMBoundary,
  end: DOMBoundary,
): Node[] {
  const result: Node[] = [];
  const parent = start.parentNode;
  if (parent === null || end.parentNode !== parent) return result;
  let node = start.nextSibling;
  while (node !== null && node !== end) {
    result.push(node);
    node = node.nextSibling;
  }
  if (node !== end) result.length = 0;
  return result;
}

export function firstRangeElement(
  start: DOMBoundary,
  end: DOMBoundary,
): Element | null {
  let node = firstRangeNode(start, end);
  while (node !== null && node !== end) {
    if (node.nodeType === 1) return node as Element;
    node = node.nextSibling;
  }
  return null;
}

export function rangeContains(
  start: DOMBoundary,
  end: DOMBoundary,
  target: Node,
): boolean {
  let node = firstRangeNode(start, end);
  while (node !== null && node !== end) {
    if (node.contains(target)) return true;
    node = node.nextSibling;
  }
  return false;
}

export function activeRangeElement(node: Node): Element | null {
  const root = node.getRootNode() as Document | ShadowRoot;
  return "activeElement" in root
    ? root.activeElement
    : node.ownerDocument!.activeElement;
}

function tryFocus(element: Element, options?: FocusOptions): boolean {
  const candidate = element as HTMLElement | SVGElement;
  if (typeof candidate.focus !== "function") return false;
  candidate.focus(options);
  return activeRangeElement(element) === element;
}

export function focusRange(
  start: DOMBoundary,
  end: DOMBoundary,
  state: { readonly disposed: boolean },
  options?: FocusOptions,
): void {
  let node = firstRangeNode(start, end);
  while (node !== null && node !== end) {
    if (state.disposed) return;
    const next = node.nextSibling;
    if (node.nodeType === 1) {
      const root = node as Element;
      if (tryFocus(root, options) || state.disposed) return;
      const descendants = root.querySelectorAll("*");
      for (let i = 0; i < descendants.length; i++) {
        if (state.disposed || tryFocus(descendants[i]!, options)) return;
      }
    }
    node = next;
  }
}

export function blurRange(start: DOMBoundary, end: DOMBoundary): void {
  const active = activeRangeElement(start);
  if (active === null || !rangeContains(start, end, active)) return;
  const candidate = active as HTMLElement | SVGElement;
  if (typeof candidate.blur === "function") candidate.blur();
}

export function collectRangeRects(
  start: DOMBoundary,
  end: DOMBoundary,
): DOMRect[] {
  const result: DOMRect[] = [];
  let node = firstRangeNode(start, end);
  let range: Range | undefined;
  while (node !== null && node !== end) {
    let rects: DOMRectList | undefined;
    if (node.nodeType === 1) {
      rects = (node as Element).getClientRects();
    } else if (node.nodeType === 3 && node.nodeValue !== "") {
      range ??= node.ownerDocument!.createRange();
      range.selectNodeContents(node);
      rects = range.getClientRects();
    }
    if (rects !== undefined) {
      for (let i = 0; i < rects.length; i++) result.push(rects[i]!);
    }
    node = node.nextSibling;
  }
  return result;
}
