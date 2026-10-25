/**
 * Environment-agnostic oracle: mounts renderables with the real reflex-dom and
 * snapshots observable DOM state, not the operations that produced it.
 */
import * as dom from "@volynets/reflex-dom";
import * as jsxRuntime from "@volynets/reflex-dom/jsx-runtime";
import * as compilerRuntime from "../../src/runtime";

const MODULES: Record<string, unknown> = {
  "@volynets/reflex-dom": dom,
  "@volynets/reflex-dom/jsx-runtime": jsxRuntime,
  "@volynets/reflex-dom-compiler/runtime": compilerRuntime,
};

export function evaluate(body: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const require = (name: string) => {
    const module = MODULES[name];
    if (module === undefined) throw new Error(`Unknown module ${name}`);
    return module;
  };
  new Function("__require", "__exports", body)(require, exports);
  return exports;
}

export type NodeSnapshot =
  | {
      type: "element";
      namespace: string | null;
      name: string;
      sameDocument: boolean;
      attributes: [string | null, string, string][];
      properties: Record<string, unknown>;
      children: NodeSnapshot[];
    }
  | { type: "text"; data: string; sameDocument: boolean }
  | { type: "comment"; data: string }
  | { type: string };

const REFLECTED = ["id", "className", "title", "lang", "dir", "hidden", "disabled", "inert", "href", "src", "alt"];

export function snapshot(node: Node, doc: Document): NodeSnapshot {
  if (node.nodeType === 1) {
    const element = node as Element;
    const properties: Record<string, unknown> = {};
    for (const name of REFLECTED) {
      if (name in element) properties[name] = (element as unknown as Record<string, unknown>)[name];
    }
    return {
      type: "element",
      namespace: element.namespaceURI,
      name: element.localName,
      sameDocument: element.ownerDocument === doc,
      attributes: Array.from(element.attributes, (a) => [a.namespaceURI, a.name, a.value]),
      properties,
      children: Array.from(element.childNodes, (child) => snapshot(child, doc)),
    };
  }
  if (node.nodeType === 3) {
    return { type: "text", data: (node as Text).data, sameDocument: node.ownerDocument === doc };
  }
  if (node.nodeType === 8) return { type: "comment", data: (node as Comment).data };
  return { type: node.nodeName };
}

/** A mutation record in a form comparable across independent DOM trees. */
export interface MutationTrace {
  type: string;
  target: string;
  attributeName: string | null;
  oldValue: string | null;
  added: string[];
  removed: string[];
  previousSibling: string | null;
  nextSibling: string | null;
}

/** Child-index path from the observed root, e.g. "root/1/0". */
function pathOf(node: Node, root: Node): string {
  const parts: number[] = [];
  for (let current = node; current !== root; current = current.parentNode!) {
    if (current.parentNode === null) return "<detached>";
    parts.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
  }
  return ["root", ...parts].join("/");
}

function describeNode(node: Node | null): string | null {
  if (node === null) return null;
  if (node.nodeType === 1) return (node as Element).outerHTML;
  return `${node.nodeName}:${node.nodeValue}`;
}

function traceRecords(records: MutationRecord[], root: Node): MutationTrace[] {
  return records.map((record) => ({
    type: record.type,
    target: pathOf(record.target, root),
    attributeName: record.attributeName,
    oldValue: record.oldValue,
    added: Array.from(record.addedNodes, (node) => describeNode(node)!),
    removed: Array.from(record.removedNodes, (node) => describeNode(node)!),
    previousSibling: describeNode(record.previousSibling),
    nextSibling: describeNode(record.nextSibling),
  }));
}

const OBSERVE_ALL: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeOldValue: true,
  characterData: true,
  characterDataOldValue: true,
};

export interface Mounted {
  readonly container: Element;
  readonly snapshot: NodeSnapshot[] | { error: string };
  readonly html: string;
  /** What a MutationObserver on the container saw during mount. */
  readonly mutations: MutationTrace[];
  /** Disposes, returning what the observer saw during dispose. */
  dispose(): MutationTrace[];
}

/** An entry point compiled from a fixture: renders into the container. */
export type MountEntry = (container: Element) => () => void;

/**
 * Mounts an entry into a fresh container of `doc`, observed the way a user
 * program would observe it: one MutationObserver installed before mount.
 */
export function mountApp(entry: unknown, doc: Document = document, parent?: Element): Mounted {
  const container = parent ?? doc.createElement("div");
  if (parent === undefined) doc.body.appendChild(container);
  const View = doc.defaultView ?? window;
  const observer = new View.MutationObserver(() => {});
  observer.observe(container, OBSERVE_ALL);
  let dispose = () => {};
  try {
    dispose = (entry as MountEntry)(container);
  } catch (error) {
    observer.disconnect();
    container.remove();
    return {
      container,
      snapshot: { error: (error as Error).name },
      html: "",
      mutations: [],
      dispose: () => [],
    };
  }
  const mutations = traceRecords(observer.takeRecords(), container);
  return {
    container,
    snapshot: Array.from(container.childNodes, (child) => snapshot(child, doc)),
    html: container.innerHTML,
    mutations,
    dispose() {
      dispose();
      const records = traceRecords(observer.takeRecords(), container);
      observer.disconnect();
      container.remove();
      return records;
    },
  };
}
