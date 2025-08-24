/**
 * HTML and DOM `nodeType` values.
 *
 * Each DOM `Node` has a numeric `nodeType` property representing
 * the kind of node. Use these constants to reliably check node types.
 *
 * Usage:
 * ```ts
 * if (node.nodeType === NodeType.ELEMENT_NODE) {
 *   console.log('This is an element node.');
 * }
 * ```
 */
export const enum DOMNodeType {
  /** Element node, e.g. `<div>` or `<span>` */
  ELEMENT_NODE = 0x01,

  /** @deprecated Use Element.getAttribute instead. Attribute node (deprecated) */
  ATTRIBUTE_NODE = 0x02,

  /** Text node containing textual content */
  TEXT_NODE = 0x03,

  /** CDATA section (mostly XML) */
  CDATA_SECTION_NODE = 0x04,

  /** @deprecated Entity reference node (deprecated) */
  ENTITY_REFERENCE_NODE = 0x05,

  /** @deprecated Entity node (deprecated) */
  ENTITY_NODE = 0x06,

  /** Processing instruction, e.g. `<?xml version="1.0"?>` */
  PROCESSING_INSTRUCTION_NODE = 0x07,

  /** Comment node, e.g. `<!-- comment -->` */
  COMMENT_NODE = 0x08,

  /** The document node itself */
  DOCUMENT_NODE = 0x09,

  /** Document type declaration, e.g. `<!DOCTYPE html>` */
  DOCUMENT_TYPE_NODE = 0x0a,

  /** Document fragment, a lightweight container not in main DOM */
  DOCUMENT_FRAGMENT_NODE = 0x0b,

  /** @deprecated Notation node declared in DTD (deprecated) */
  NOTATION_NODE = 0x0c,
}
