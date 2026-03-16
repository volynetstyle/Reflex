import {
  ReactiveNode,
  ReactiveNodeState,
  ReactiveNodeKind,
  EngineContext,
  type EngineHooks,
} from "./core.js";
import { writeSignal, batchWrite, ensureFresh } from "./engine.js";
import { trackRead } from "./tracking.js";

export interface Signal<T> {
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  readonly node: ReactiveNode;
  (): T;
}

export type BatchWriteEntry = readonly [Signal<unknown>, unknown];

export interface RuntimeOptions {
  hooks?: EngineHooks;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
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
    writeSignal(this.ctx, this.node, value);
  }
}

function createComputed<T>(node: ReactiveNode, ctx: EngineContext): Computed<T> {
  const computed = function () {
    if (ctx.activeComputed) trackRead(ctx, node);

    if (node.isDirty || node.computedAt === 0) ensureFresh(ctx, node);

    return node.value as T;
  } as Computed<T>;

  Object.defineProperty(computed, "node", {
    value: node,
    enumerable: true,
  });

  return computed;
}

function createBatchWrite(
  ctx: EngineContext,
): (writes: ReadonlyArray<BatchWriteEntry>) => void {
  const nodeWrites: Array<[ReactiveNode, unknown]> = [];

  return (writes) => {
    const count = writes.length;
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

    batchWrite(ctx, nodeWrites);
  };
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const ctx = new EngineContext(options?.hooks);
  const writeBatch = createBatchWrite(ctx);

  function signal<T>(initialValue: T): Signal<T> {
    const node = new ReactiveNode(
      initialValue,
      null,
      ReactiveNodeState.Ordered,
      ReactiveNodeKind.Signal,
    );

    return new SignalImpl(node, ctx);
  }

  function computed<T>(fn: () => T): Computed<T> {
    const node = new ReactiveNode(
      undefined,
      fn,
      ReactiveNodeState.Invalid,
      ReactiveNodeKind.Computed,
    );

    return createComputed<T>(node, ctx);
  }

  function memo<T>(fn: () => T): Computed<T> {
    const computedNode = computed(fn);
    computedNode();
    return computedNode;
  }

  return {
    signal,
    computed,
    memo,
    batchWrite: writeBatch,
    ctx,
  };
}
