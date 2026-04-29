export function insertBefore(anchor: Node, nodes: readonly Node[]): void {
  const length = nodes.length;
  if (length === 0) return;

  const parent = anchor.parentNode;
  if (parent === null) return;

  if (length === 1) {
    parent.insertBefore(nodes[0]!, anchor);
    return;
  }

  const ao = anchor.ownerDocument;
  if (ao === null) return;
  const frag = ao.createDocumentFragment();

  for (let i = 0; i < length; i++) {
    frag.appendChild(nodes[i]!);
  }

  parent.insertBefore(frag, anchor);
}

export function moveRangeBefore(start: Node, end: Node, anchor: Node): void {
  const parent = start.parentNode;

  if (
    parent === null ||
    end.parentNode !== parent ||
    anchor.parentNode !== parent
  ) {
    return;
  }

  // already directly before anchor
  if (end.nextSibling === anchor) {
    return;
  }

  // anchor is inside the range: moving range before itself is a no-op
  let scan: Node | null = start;
  while (scan !== null) {
    if (scan === anchor) return;
    if (scan === end) break;
    scan = scan.nextSibling;
  }

  const ao = anchor.ownerDocument;

  if (ao === null) return;

  const frag = ao.createDocumentFragment();
  let node: Node | null = start;

  while (node !== null) {
    const next: Node | null = node === end ? null : node.nextSibling;
    frag.appendChild(node);

    if (node === end) break;
    node = next;
  }

  parent.insertBefore(frag, anchor);
}

export function clearBetween(start: Node, end: Node): void {
  const parent = start.parentNode;

  if (parent === null || end.parentNode !== parent) {
    return;
  }

  let node = start.nextSibling;

  while (node !== null && node !== end) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}
