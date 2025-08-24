// Core DOM Node interface, base for all DOM nodes
export interface DOMNode {
  // Node type constants as per https://dom.spec.whatwg.org/#interface-node
  readonly nodeType: number;
  readonly nodeName: string;
  readonly ownerDocument: Document | null;
  parentNode: DOMNode | null;
  parentElement: Element | null;
  readonly childNodes: NodeList<DOMNode>;
  firstChild: DOMNode | null;
  lastChild: DOMNode | null;
  previousSibling: DOMNode | null;
  nextSibling: DOMNode | null;
  nodeValue: string | null;
  textContent: string | null;

  // Methods for node manipulation
  appendChild<T extends DOMNode>(node: T): T;
  insertBefore<T extends DOMNode>(node: T, child: DOMNode | null): T;
  removeChild<T extends DOMNode>(child: T): T;
  replaceChild<T extends DOMNode>(newChild: T, oldChild: DOMNode): T;
  cloneNode(deep?: boolean): DOMNode;
  contains(other: DOMNode | null): boolean;
  isEqualNode(other: DOMNode | null): boolean;

  // Event handling
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: DOMNode, ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: DOMNode, ev: HTMLElementEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void;
  dispatchEvent(event: Event): boolean;
}

// Node type constants for clarity and type safety
export enum NodeType {
  ELEMENT_NODE = 1,
  TEXT_NODE = 3,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_TYPE_NODE = 10,
  DOCUMENT_FRAGMENT_NODE = 11,
}

// Generic NodeList interface for collections of nodes
export interface NodeList<T extends DOMNode> {
  readonly length: number;
  item(index: number): T | null;
  [index: number]: T;
  [Symbol.iterator](): Iterator<T>;
}

// Document interface, representing the root of the DOM tree
export interface Document extends DOMNode {
  readonly nodeType: typeof NodeType.DOCUMENT_NODE;
  readonly documentElement: Element | null;
  readonly body: HTMLElement | null;
  readonly head: HTMLHeadElement | null;
  defaultView: Window | null;

  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];
  createElementNS(namespaceURI: string | null, qualifiedName: string): Element;
  createTextNode(data: string): TextNode;
  createComment(data: string): CommentNode;
  createDocumentFragment(): DocumentFragment;

  getElementById(id: string): Element | null;
  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
  querySelector<E extends Element = Element>(selectors: string): E | null;
  querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeList<HTMLElementTagNameMap[K]>;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeList<E>;

  adoptNode<T extends DOMNode>(node: T): T;
  importNode<T extends DOMNode>(node: T, deep: boolean): T;
}

// Element interface, representing HTML or SVG elements
export interface Element extends DOMNode {
  readonly nodeType: typeof NodeType.ELEMENT_NODE;
  readonly tagName: string;
  readonly attributes: NamedNodeMap;
  readonly classList: DOMTokenList;
  id: string;
  className: string;
  innerHTML: string;
  outerHTML: string;

  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;

  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
  querySelector<E extends Element = Element>(selectors: string): E | null;
  querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeList<HTMLElementTagNameMap[K]>;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeList<E>;

  getElementsByTagName<K extends keyof HTMLElementTagNameMap>(tagName: K): NodeList<HTMLElementTagNameMap[K]>;
  getElementsByTagName<E extends Element = Element>(tagName: string): NodeList<E>;
  getElementsByClassName(className: string): NodeList<Element>;

  matches(selectors: string): boolean;
  closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null;
  closest<E extends Element = Element>(selector: string): E | null;
}

// HTMLElement interface, extending Element for HTML-specific elements
export interface HTMLElement extends Element {
  title: string;
  lang: string;
  dir: string;
  hidden: boolean;
  tabIndex: number;
  accessKey: string;

  style: CSSStyleDeclaration;
  dataset: DOMStringMap;

  click(): void;
  focus(options?: FocusOptions): void;
  blur(): void;
}

// Specific HTML element interfaces (subset for brevity)
export interface HTMLHeadElement extends HTMLElement {
  readonly tagName: 'HEAD';
}

export interface HTMLBodyElement extends HTMLElement {
  readonly tagName: 'BODY';
}

export interface HTMLAnchorElement extends HTMLElement {
  readonly tagName: 'A';
  href: string;
  target: string;
  rel: string;
}

export interface HTMLInputElement extends HTMLElement {
  readonly tagName: 'INPUT';
  type: string;
  value: string;
  checked: boolean;
  disabled: boolean;
}

// Text node interface
export interface TextNode extends DOMNode {
  readonly nodeType: typeof NodeType.TEXT_NODE;
  readonly data: string;
  readonly wholeText: string;
  splitText(offset: number): TextNode;
}

// Comment node interface
export interface CommentNode extends DOMNode {
  readonly nodeType: typeof NodeType.COMMENT_NODE;
  readonly data: string;
}

// DocumentFragment interface
export interface DocumentFragment extends DOMNode {
  readonly nodeType: typeof NodeType.DOCUMENT_FRAGMENT_NODE;
}

// NamedNodeMap for element attributes
export interface NamedNodeMap {
  readonly length: number;
  getNamedItem(name: string): Attr | null;
  setNamedItem(attr: Attr): void;
  removeNamedItem(name: string): Attr;
  item(index: number): Attr | null;
  [index: number]: Attr;
}

// Attr interface for element attributes
export interface Attr {
  readonly name: string;
  value: string;
  readonly namespaceURI: string | null;
  readonly localName: string;
}

// DOMTokenList for classList
export interface DOMTokenList {
  readonly length: number;
  value: string;
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  toggle(token: string, force?: boolean): boolean;
  contains(token: string): boolean;
  [index: number]: string;
  [Symbol.iterator](): Iterator<string>;
}

// CSSStyleDeclaration for element.style
export interface CSSStyleDeclaration {
  cssText: string;
  getPropertyValue(property: string): string;
  setProperty(property: string, value: string | null, priority?: string): void;
  removeProperty(property: string): string;
  [index: number]: string;
}

// DOMStringMap for dataset
export interface DOMStringMap {
  [key: string]: string | undefined;
}

// Event-related interfaces (simplified)
export interface Event {
  readonly type: string;
  readonly target: DOMNode | null;
  readonly currentTarget: DOMNode | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface AddEventListenerOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
}

export interface EventListenerOptions {
  capture?: boolean;
}

// Type map for HTML elements (subset for brevity)
export interface HTMLElementTagNameMap {
  'a': HTMLAnchorElement;
  'body': HTMLBodyElement;
  'head': HTMLHeadElement;
  'input': HTMLInputElement;
  'div': HTMLElement;
  'span': HTMLElement;
  'p': HTMLElement;
  // Add more as needed
}

