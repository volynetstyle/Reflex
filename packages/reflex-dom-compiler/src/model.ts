/**
 * The DOM a static region produces, normalized to exactly the nodes and
 * attributes `reflex-dom` would create for it. Emitters only print this tree;
 * every semantic decision is made while building it in `classify.ts`.
 */
export type StaticNode = StaticElement | StaticText;

export interface StaticElement {
  readonly type: "element";
  /** Lowercase HTML tag from the supported set. */
  readonly tag: string;
  /** In the order `reflex-dom` applies them, which is the props order. */
  readonly attributes: readonly StaticAttribute[];
  readonly children: readonly StaticNode[];
}

export interface StaticAttribute {
  readonly name: string;
  readonly value: string;
}

export interface StaticText {
  readonly type: "text";
  /** May be empty: an empty string inside a children array is a real node. */
  readonly value: string;
}

export function countNodes(node: StaticNode): number {
  if (node.type === "text") return 1;
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

/** One non-empty text child: `reflex-dom` and the emitters use `textContent`. */
export function soleTextChild(element: StaticElement): string | null {
  const [only] = element.children;
  return element.children.length === 1 &&
    only!.type === "text" &&
    only!.value !== ""
    ? only!.value
    : null;
}
