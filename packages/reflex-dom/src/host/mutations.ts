const SPREAD_ARG_SAFE_LIMIT = 16_000;
const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;

// In Edge/Chromium 150, Range-based move/clear variants were slower than
// manual sibling walks across both short and long ranges. The cost also
// increased with startIndex; at startIndex=9000 even an almost empty Range
// setup was ~0.1 ms. Keep manual moveRangeBefore/clearBetween as defaults.
// Range variants may stay only as experimental/reference implementations.

// The core idea across all three functions: every call that crosses the
// JS -> native (V8 <-> Blink/Gecko) boundary has fixed overhead independent
// of how much work it does on the other side. So the win is not "fewer DOM
// mutations" (the original code already batched via DocumentFragment) but
// *fewer JS-level calls/loops*, by delegating batch work to a single native
// API call wherever the spec guarantees the browser does it natively.
//
// Caveat, and it's an important one given how DOM engines actually work:
// Range.setStartBefore/setStartAfter/setEndBefore/setEndAfter must resolve
// to a (container, offset) boundary point, where offset is "index of node
// among container's children". In WebKit/Blink this index is NOT cached on
// Node - computing it walks the previousSibling chain. That means for a
// short range deep inside a long sibling list (e.g. moving 2 items in a
// 10,000-row virtualized list), the Range-based variants below can be
// *slower* than the plain per-node walk, because the walk's cost becomes
// O(index-in-parent) instead of O(range length). This is exactly the kind
// of case where two structurally similar-looking approaches diverge in
// opposite directions depending on shape - don't trust either version
// without profiling both against your actual node-count distributions.
export function insertBefore(anchor: Node, nodes: readonly Node[]): void {
  const length = nodes.length;
  if (length === 0) return;

  // ChildNode.before(...) is spec'd to skip fragment allocation entirely
  // when given a single node ("convert nodes into a node" degenerates to
  // returning that node), and to build+insert the fragment natively for
  // the multi-node case. So this one call subsumes both branches of the
  // original function, fully on the native side.
  //
  // Invariant this relies on: `anchor` is always Text/Comment/Element in
  // this runtime, never Document/DocumentFragment/Attr (those don't
  // implement ChildNode). Keep that invariant true or this throws.
  if (length < SPREAD_ARG_SAFE_LIMIT) {
    (anchor as ChildNode).before(...nodes);
    return;
  }

  // Fallback for pathological huge batches: avoid spreading tens of
  // thousands of arguments into a single call (V8's argument-count limit
  // for spread calls is in the ~65k range; this floor is a wide margin
  // below that, not the actual cliff).
  const parent = anchor.parentNode;
  if (parent === null) return;
  const ao = anchor.ownerDocument;
  if (ao === null) return;
  const frag = ao.createDocumentFragment();
  for (let i = 0; i < length; ++i) frag.appendChild(nodes[i]!);
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

  // anchor inside [start, end] -> moving range before itself is a no-op.
  // compareDocumentPosition is a single native call instead of a JS-level
  // O(range length) sibling walk - a real complexity win for long ranges,
  // and doesn't carry the index-computation risk Range boundary points do
  // (it compares relative order, not absolute offsets).
  if (anchor === start || anchor === end) return;
  const relStart = start.compareDocumentPosition(anchor);
  const relEnd = end.compareDocumentPosition(anchor);
  if (
    (relStart & DOCUMENT_POSITION_FOLLOWING) !== 0 &&
    (relEnd & DOCUMENT_POSITION_PRECEDING) !== 0
  ) {
    return;
  }

  const ao = start.ownerDocument;
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

  const first = start.nextSibling;
  // nothing between start and end - the common case for e.g. toggled
  // conditional blocks with no content; skip all further work.
  if (first === end) return;

  let node: Node | null = first;
  while (node !== null && node !== end) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}
