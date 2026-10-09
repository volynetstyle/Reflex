import type { DOMBoundary } from "./range-primitives";

type ElementObserver = ResizeObserver | IntersectionObserver;

// Browser observers have one subscription per target, even across handles.
const observerTargets = new WeakMap<
  ElementObserver,
  WeakMap<Element, number>
>();

function retainTarget(observer: ElementObserver, target: Element): void {
  let counts = observerTargets.get(observer);
  if (counts === undefined) {
    counts = new WeakMap();
    observerTargets.set(observer, counts);
  }
  const count = counts.get(target) ?? 0;
  counts.set(target, count + 1);
  if (count === 0) {
    try {
      observer.observe(target);
    } catch (error) {
      counts.delete(target);
      throw error;
    }
  }
}

function releaseTarget(observer: ElementObserver, target: Element): void {
  const counts = observerTargets.get(observer);
  const count = counts?.get(target);
  if (count === undefined) return;
  if (count === 1) {
    counts!.delete(target);
    observer.unobserve(target);
  } else {
    counts!.set(target, count - 1);
  }
}

class RangeSubscription {
  private stopped = false;
  private readonly targets = new Set<Element>();

  constructor(
    private readonly membership: DOMRangeMembership,
    private readonly observer: ElementObserver,
  ) {}

  sync(next: Set<Element>): void {
    if (this.stopped) return;
    for (const target of this.targets) {
      if (!next.has(target)) {
        this.targets.delete(target);
        releaseTarget(this.observer, target);
        if (this.stopped) return;
      }
    }
    for (const target of next) {
      if (this.stopped) return;
      if (!this.targets.has(target)) {
        this.targets.add(target);
        try {
          retainTarget(this.observer, target);
        } catch (error) {
          this.targets.delete(target);
          this.stop();
          throw error;
        }
      }
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.membership.remove(this);
    for (const target of this.targets) {
      this.targets.delete(target);
      releaseTarget(this.observer, target);
    }
  }
}

/** One membership walk and MutationObserver for all subscriptions of a handle. */
export class DOMRangeMembership {
  private readonly subscriptions = new Set<RangeSubscription>();
  private readonly next = new Set<Element>();
  private readonly mutations: MutationObserver;
  private parent: Node | null | undefined;
  private lastParent: Node | undefined;
  private recoveryRoots: Node[] | undefined;

  constructor(
    private readonly start: DOMBoundary,
    private readonly end: DOMBoundary,
    private readonly onEmpty: () => void,
  ) {
    const MutationObserverType =
      start.ownerDocument.defaultView?.MutationObserver;
    if (MutationObserverType === undefined) {
      throw new Error(
        "Range observation requires a document with MutationObserver.",
      );
    }
    this.mutations = new MutationObserverType(() => this.sync());
  }

  add(observer: ElementObserver): () => void {
    const subscription = new RangeSubscription(this, observer);
    // Register before calling observer methods, which may dispose the handle.
    this.subscriptions.add(subscription);
    try {
      // New subscriptions see physical membership before queued mutations arrive.
      this.sync();
      return () => subscription.stop();
    } catch (error) {
      subscription.stop();
      throw error;
    }
  }

  remove(subscription: RangeSubscription): void {
    this.subscriptions.delete(subscription);
    if (this.subscriptions.size === 0) {
      this.mutations.disconnect();
      this.next.clear();
      this.parent = undefined;
      this.lastParent = undefined;
      this.recoveryRoots = undefined;
      this.onEmpty();
    }
  }

  stop(): void {
    for (const subscription of this.subscriptions) subscription.stop();
  }

  private bind(): void {
    const startParent = this.start.parentNode;
    const parent =
      startParent !== null && this.end.parentNode === startParent
        ? startParent
        : null;
    if (parent !== null) {
      if (this.parent !== parent) {
        this.mutations.disconnect();
        this.mutations.observe(parent, { childList: true });
        this.parent = parent;
        this.lastParent = parent;
        this.recoveryRoots = undefined;
      }
      return;
    }

    // Parent observation cannot see anchors reattached in a later turn. Broaden
    // only while boundaries have no common parent, then return to parent-only.
    const roots = [
      this.start.ownerDocument,
      this.end.ownerDocument,
      this.start.getRootNode(),
      this.end.getRootNode(),
    ];
    // Keep the last known tree reachable for later reattachment in a detached
    // fragment or a closed shadow root (document observation cannot see these).
    if (this.lastParent !== undefined)
      roots.push(this.lastParent.getRootNode());
    if (
      this.parent === null &&
      this.recoveryRoots !== undefined &&
      roots.every((root, i) => root === this.recoveryRoots![i])
    )
      return;
    this.mutations.disconnect();
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]!;
      if (roots.indexOf(root) === i) {
        this.mutations.observe(root, { childList: true, subtree: true });
      }
    }
    this.parent = null;
    this.recoveryRoots = roots;
  }

  private sync(): void {
    this.bind();
    this.next.clear();
    if (this.parent !== null) {
      let node = this.start.nextSibling;
      while (node !== null && node !== this.end) {
        if (node.nodeType === 1) this.next.add(node as Element);
        node = node.nextSibling;
      }
      if (node !== this.end) this.next.clear();
    }
    for (const subscription of this.subscriptions) subscription.sync(this.next);
  }
}
