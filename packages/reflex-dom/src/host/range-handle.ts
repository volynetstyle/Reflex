import { DOMRangeMembership } from "./range-observation";
import {
  blurRange,
  collectRangeRects,
  firstRangeElement,
  focusRange,
  snapshotRangeNodes,
  type DOMBoundary,
} from "./range-primitives";

/** A live view of the physical siblings between two anchors, without a wrapper. */
export interface DOMRangeHandle {
  readonly disposed: boolean;
  /** Snapshot of current siblings, excluding the two boundary anchors. */
  nodes(): Iterable<Node>;
  /** Focus the first focusable element in DOM order, including descendants. */
  focus(options?: FocusOptions): void;
  /** Blur the active element if it belongs to this range. */
  blur(): void;
  /** Client rects of top-level elements and nonempty text nodes. */
  rects(): DOMRect[];
  /** Scroll the first top-level element into view. */
  scrollIntoView(options?: ScrollIntoViewOptions): void;
  /** Observe top-level elements; membership updates at mutation checkpoints. */
  observe(observer: ResizeObserver | IntersectionObserver): () => void;
  /** Release observations and empty this handle; does not remove DOM nodes. */
  dispose(): void;
}

const noop = () => {};

class LiveDOMRangeHandle implements DOMRangeHandle {
  private closed = false;
  private membership: DOMRangeMembership | undefined;

  constructor(
    private readonly start: DOMBoundary,
    private readonly end: DOMBoundary,
  ) {}

  get disposed(): boolean {
    return this.closed;
  }

  nodes(): Node[] {
    return this.closed ? [] : snapshotRangeNodes(this.start, this.end);
  }

  focus(options?: FocusOptions): void {
    if (!this.closed) focusRange(this.start, this.end, this, options);
  }

  blur(): void {
    if (!this.closed) blurRange(this.start, this.end);
  }

  rects(): DOMRect[] {
    // Reuse one Range within a call. Retaining a live Range between calls would
    // add native range maintenance to subsequent DOM mutations.
    return this.closed ? [] : collectRangeRects(this.start, this.end);
  }

  scrollIntoView(options?: ScrollIntoViewOptions): void {
    if (!this.closed)
      firstRangeElement(this.start, this.end)?.scrollIntoView(options);
  }

  observe(observer: ResizeObserver | IntersectionObserver): () => void {
    if (this.closed) return noop;
    this.membership ??= new DOMRangeMembership(this.start, this.end, () => {
      this.membership = undefined;
    });
    return this.membership.add(observer);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.membership?.stop();
    this.membership = undefined;
  }
}

/** Create a standalone handle. Its caller owns disposal and the boundary anchors. */
export function createDOMRangeHandle(
  start: Text | Comment,
  end: Text | Comment,
): DOMRangeHandle {
  return new LiveDOMRangeHandle(start, end);
}
