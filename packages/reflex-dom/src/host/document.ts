/** Use the target's document, including detached documents and iframe realms. */
export function ownerDocument(node: Node): Document {
  return node.nodeType === 9 ? (node as Document) : node.ownerDocument!;
}

export function isDOMNode(value: unknown): value is Node {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Node;
  const document =
    node.nodeType === 9 ? (node as Document) : node.ownerDocument;
  if (document == null) return false;
  const NodeType =
    document?.defaultView?.Node ??
    (typeof Node === "undefined" ? undefined : Node);
  if (NodeType === undefined) return false;
  if (value instanceof NodeType) return true;
  // Adoption changes ownerDocument, but keeps the object's original realm.
  // A native brand check accepts those nodes without accepting lookalike objects.
  try {
    return NodeType.prototype.isSameNode.call(node, node);
  } catch {
    return false;
  }
}

export const isTextNode = (node: Node | null): node is Text =>
  node?.nodeType === 3;
export const isCommentNode = (node: Node | null): node is Comment =>
  node?.nodeType === 8;
export const isElementNode = (node: Node | null): node is Element =>
  node?.nodeType === 1;
export const isHTMLElement = (element: Element): element is HTMLElement =>
  element.namespaceURI === "http://www.w3.org/1999/xhtml";
export function isHTMLTag<K extends keyof HTMLElementTagNameMap>(
  element: Element,
  tag: K,
): element is HTMLElementTagNameMap[K] {
  return isHTMLElement(element) && element.localName === tag;
}
