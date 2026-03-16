import {
  ReactiveNode,
  ReactiveNodeState,
  ReactiveNodeKind,
  EngineContext,
  isDirtyState,
  type EngineHooks,
} from "./core.js";
import { ensureFresh, markInvalid } from "./engine.js";
import { trackRead } from "./tracking.js";

export interface Signal<T> {
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

// Pure lazy derivation: no ownership, no cleanup, no child scope disposal.
export interface Computed<T> {
  readonly node: ReactiveNode;
  (): T;
}

// Reserved for owner-scoped side effects. Computed values intentionally do not
// implement this shape to keep derivation semantics separate from ownership.
export interface EffectScope {
  readonly node: ReactiveNode;
  dispose(): void;
}

export type BatchWriteEntry = readonly [Signal<unknown>, unknown];

export interface RuntimeOptions {
  hooks?: EngineHooks;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  // Returns a pure lazy derived value. It is not an owner and does not need disposal.
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

function readComputedValue<T>(ctx: EngineContext, node: ReactiveNode): T {
  if (ctx.activeComputed) trackRead(ctx, node);
  return node.value as T;
}

function refreshComputedValue<T>(ctx: EngineContext, node: ReactiveNode): T {
  ensureFresh(ctx, node);
  return readComputedValue<T>(ctx, node);
}

class SignalImpl<T> implements Signal<T> {
  constructor(
    public readonly node: ReactiveNode,
    private ctx: EngineContext,
  ) {}

  read(): T {
    if (this.ctx.activeComputed) trackRead(this.ctx, this.node);

    return this.node.value as T;
  }

  write(value: T) {
    if (Object.is(this.node.value, value)) return;

    this.node.value = value;
    this.node.t = this.ctx.bumpEpoch();

    for (let e = this.node.firstOut; e; e = e.nextOut) {
      markInvalid(this.ctx, e.to);
    }
  }
}

class RuntimeImpl implements Runtime {
  readonly ctx: EngineContext;
  private readonly nodeWrites: Array<[ReactiveNode, unknown]> = [];

  constructor(options?: RuntimeOptions) {
    this.ctx = new EngineContext(options?.hooks);
  }

  signal<T>(initialValue: T): Signal<T> {
    const node = new ReactiveNode(
      initialValue,
      null,
      ReactiveNodeState.Ordered,
      ReactiveNodeKind.Signal,
    );

    return new SignalImpl(node, this.ctx);
  }

  computed<T>(fn: () => T): Computed<T> {
    const node = new ReactiveNode(
      undefined,
      fn,
      ReactiveNodeState.Invalid,
      ReactiveNodeKind.Computed,
    );

    const ctx = this.ctx;
    const computed = function () {
      if (!isDirtyState(node.state) && node.v !== 0) {
        return readComputedValue<T>(ctx, node);
      }

      return refreshComputedValue<T>(ctx, node);
    } as Computed<T>;

    (computed as { node: ReactiveNode }).node = node;

    return computed;
  }

  memo<T>(fn: () => T): Computed<T> {
    const computedNode = this.computed(fn);
    computedNode();
    return computedNode;
  }

  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void {
    const count = writes.length;
    const nodeWrites = this.nodeWrites;

    nodeWrites.length = count;

    for (let i = 0; i < count; i++) {
      const [signal, value] = writes[i]!;
      const entry = nodeWrites[i];

      if (entry) {
        entry[0] = signal.node;
        entry[1] = value;
      } else {
        nodeWrites[i] = [signal.node, value];
      }
    }

    this.ctx.bumpEpoch();

    for (const [node, value] of nodeWrites) {
      if (Object.is(node.value, value)) continue;

      node.value = value;
      node.t = this.ctx.getEpoch();

      for (let e = node.firstOut; e; e = e.nextOut) {
        markInvalid(this.ctx, e.to);
      }
    }
  }
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  return new RuntimeImpl(options);
}
