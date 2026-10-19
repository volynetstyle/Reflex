/**
 * Environment-agnostic oracle: mounts renderables with the real reflex-dom and
 * snapshots observable DOM state, not the operations that produced it.
 */
import { render } from "@volynets/reflex-dom";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
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

export interface Mounted {
  readonly container: Element;
  readonly snapshot: NodeSnapshot[] | { error: string };
  readonly html: string;
  dispose(): void;
}

/** Mounts `<App />` into a fresh container of `doc`. */
export function mountApp(App: unknown, doc: Document = document, parent?: Element): Mounted {
  const container = parent ?? doc.createElement("div");
  if (parent === undefined) doc.body.appendChild(container);
  let dispose = () => {};
  try {
    dispose = render(jsx(App as () => null, {}), container);
  } catch (error) {
    container.remove();
    return {
      container,
      snapshot: { error: (error as Error).name },
      html: "",
      dispose() {},
    };
  }
  return {
    container,
    snapshot: Array.from(container.childNodes, (child) => snapshot(child, doc)),
    html: container.innerHTML,
    dispose() {
      dispose();
      container.remove();
    },
  };
}
