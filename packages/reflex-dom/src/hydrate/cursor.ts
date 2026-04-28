export function nextSiblingWithinBoundary(
  node: Node,
  boundary: Node | null,
): Node | null {
  const nextNode = node.nextSibling;
  return nextNode === boundary ? null : nextNode;
}