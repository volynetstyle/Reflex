/**
 * The DOM a region produces, normalized to exactly the nodes and attributes
 * `reflex-dom` would create for it. Emitters only print this tree; every
 * semantic decision is made while building it in `classify.ts`.
 */
export type StaticNode = StaticElement | StaticText | StaticHole;

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

/**
 * A dynamic child: an expression evaluated when the region is created, whose
 * value the renderer mounts at a marker (reflex-dom's `CompiledHoleMount`).
 */
export interface StaticHole {
  readonly type: "hole";
  /** Position in evaluation order, which is document order. */
  readonly index: number;
  /** The element's whole `children` value, not an array item. */
  readonly scalar: boolean;
}

/** Elements and texts the region builds itself; holes are not counted. */
export function countNodes(node: StaticNode): number {
  if (node.type === "text") return 1;
  if (node.type === "hole") return 0;
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
