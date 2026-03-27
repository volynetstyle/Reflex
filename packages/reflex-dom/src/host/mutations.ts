export function insertBefore(anchor: Node, nodes: readonly Node[]): void {
  const parent = anchor.parentNode;
  const length = nodes.length;

  if (parent === null || length === 0) return;

  if (length === 1) {
    parent.insertBefore(nodes[0]!, anchor);
    return;
  }

  const doc = anchor.ownerDocument;

  if (!doc) return;
  
  const frag = doc.createDocumentFragment();

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

  if (end.nextSibling === anchor) {
    return;
  }

  const doc = anchor.ownerDocument;
  if (!doc) return;

  const frag = doc.createDocumentFragment();
  let node: Node | null = start;

  while (node !== null) {
    const next: Node | null = node === end ? null : node.nextSibling;
    frag.appendChild(node);

    if (node === end) {
      break;
    }

    node = next;
  }

  parent.insertBefore(frag, anchor);
}

export function clearBetween(start: Node, end: Node): void {
  let node = start.nextSibling;

  while (node !== null && node !== end) {
    const next = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }
}
