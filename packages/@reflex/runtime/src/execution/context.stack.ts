export type NodeId = number;

/** Minimal capability required by runtime to track execution context. */
export interface ExecStack {
  push(node: NodeId): void;
  pop(): NodeId;
  current(): NodeId | null;
  depth(): number;

  contains(node: NodeId): boolean;
  canDependOn(dep: NodeId): boolean;
}

/** Optional capability: safe boundary execution (user code). */
export interface ExecStackWithNode extends ExecStack {
  withNode<T>(node: NodeId, fn: () => T): T;
}

/** Optional capability: internal fast path (scheduler/runtime). */
export interface ExecStackUnsafe extends ExecStack {
  enter(node: NodeId): void;
  leave(node: NodeId): void;
}

export function hasWithNode(stack: ExecStack): stack is ExecStackWithNode {
  return typeof (stack as ExecStackWithNode).withNode === "function";
}

export function hasUnsafe(stack: ExecStack): stack is ExecStackUnsafe {
  return (
    typeof (stack as ExecStackUnsafe).enter === "function" &&
    typeof (stack as ExecStackUnsafe).leave === "function"
  );
}

export class ExecutionStack implements ExecStackWithNode, ExecStackUnsafe {
  private stack: NodeId[] = [];
  private seen: Uint32Array;
  private epoch = 1;
  private depth_ = 0;

  constructor(initialNodeIdCapacity = 1024) {
    this.seen = new Uint32Array(initialNodeIdCapacity);
  }

  push(node: NodeId): void {
    // Non-negative int32 invariant (cheap, predictable).
    if ((node | 0) !== node || node < 0) throw new Error("Invalid NodeId");

    if (node >= this.seen.length) this.growSeen(node + 1);

    if (this.seen[node] === this.epoch)
      throw new Error("Execution cycle detected");

    this.seen[node] = this.epoch;
    this.stack.push(node);
    this.depth_++;
  }

  pop(): NodeId {
    if (this.depth_ === 0) throw new Error("ExecutionStack underflow");

    const node = this.stack.pop()!;
    this.seen[node] = 0;
    this.depth_--;
    return node;
  }

  current(): NodeId | null {
    return this.depth_ ? this.stack[this.depth_ - 1] : null;
  }

  depth(): number {
    return this.depth_;
  }

  contains(node: NodeId): boolean {
    return (
      node >= 0 && node < this.seen.length && this.seen[node] === this.epoch
    );
  }

  canDependOn(dep: NodeId): boolean {
    if (!this.contains(dep)) return false;
    return dep !== this.stack[this.depth_ - 1];
  }

  /** Safe boundary execution (user code). */
  withNode<T>(node: NodeId, fn: () => T): T {
    const entryDepth = this.depth_;
    this.push(node);

    try {
      return fn();
    } finally {
      // Detect corruption BEFORE pop.
      if (this.depth_ !== entryDepth + 1) {
        while (this.depth_ > entryDepth) this.pop();
        throw new Error("Execution stack corruption");
      }

      const popped = this.pop();
      if (popped !== node) throw new Error("Execution stack corruption");
    }
  }

  /** Internal fast path (scheduler/runtime). */
  enter(node: NodeId): void {
    this.push(node);
  }

  /** Internal fast path (scheduler/runtime). */
  leave(node: NodeId): void {
    const popped = this.pop();
    if (popped !== node) throw new Error("Execution stack corruption");
  }

  /** O(1) logical clear via epoch bump. */
  reset(): void {
    this.stack.length = 0;
    this.depth_ = 0;

    const next = (this.epoch + 1) >>> 0;
    if (next === 0) {
      this.seen.fill(0);
      this.epoch = 1;
    } else {
      this.epoch = next;
    }
  }

  private growSeen(min: number): void {
    let size = this.seen.length;
    while (size < min) size <<= 1;

    const next = new Uint32Array(size);
    next.set(this.seen);
    this.seen = next;
  }
}

/**
 * Single canonical entry point:
 * - If stack supports unsafe, uses enter/leave (fast, scheduler path)
 * - Else if stack supports withNode, uses withNode (safe, boundary path)
 * - Else falls back to push/pop (minimal)
 *
 * Choose mode at call-site by passing the appropriate stack implementation.
 */
export function runInNode<T>(stack: ExecStack, node: NodeId, fn: () => T): T {
  if (hasUnsafe(stack)) {
    stack.enter(node);
    try {
      return fn();
    } finally {
      stack.leave(node);
    }
  }

  if (hasWithNode(stack)) {
    return stack.withNode(node, fn);
  }

  stack.push(node);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}
