import {
  createComputedNode,
  createEffectNode,
  createSignalNode,
  ReactiveNode,
  EngineContext,
  isDirtyState,
  type EngineHooks,
} from "./core.js";
import { batchWrite as applyBatchWrite, writeSignal } from "./engine.js";
import { runEffect, disposeEffect } from "./engine/effect.js";
import {
  EffectScheduler,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "./effect_scheduler.js";
import { trackRead } from "./tracking.js";
import { ensureFresh } from "./walkers.js";

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
  effectStrategy?: EffectStrategy;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  // Returns a pure lazy derived value. It is not an owner and does not need disposal.
  computed<T>(fn: () => T): Computed<T>;
  memo<T>(fn: () => T): Computed<T>;
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
  batchWrite(writes: ReadonlyArray<BatchWriteEntry>): void;
  readonly ctx: EngineContext;
}

function readComputedValue<T>(ctx: EngineContext, node: ReactiveNode): T {
  if (ctx.activeComputed) trackRead(ctx, node);
  return node.payload as T;
}

function refreshComputedValue<T>(ctx: EngineContext, node: ReactiveNode): T {
  ensureFresh(ctx, node);
  return readComputedValue<T>(ctx, node);
}

function createComputedAccessor<T>(
  ctx: EngineContext,
  node: ReactiveNode,
): Computed<T> {
  const computed = function () {
    if (!isDirtyState(node.state) && node.v !== 0) {
      return readComputedValue<T>(ctx, node);
    }

    return refreshComputedValue<T>(ctx, node);
  } as Computed<T>;

  (computed as { node: ReactiveNode }).node = node;

  return computed;
}

class SignalImpl<T> implements Signal<T> {
  constructor(
    public readonly node: ReactiveNode,
    private ctx: EngineContext,
  ) {}

  read(): T {
    if (this.ctx.activeComputed) trackRead(this.ctx, this.node);

    return this.node.payload as T;
  }

  write(value: T) {
    writeSignal(this.ctx, this.node, value);
  }
}

class RuntimeImpl implements Runtime {
  readonly ctx: EngineContext;
  private readonly effectScheduler: EffectScheduler;
  private readonly nodeWrites: Array<[ReactiveNode, unknown]> = [];

  constructor(options?: RuntimeOptions) {
    const userHooks = options?.hooks;
    const effectStrategy = resolveEffectSchedulerMode(options?.effectStrategy);

    this.ctx = new EngineContext({
      ...userHooks,
      onEffectInvalidated: (node) => {
        this.effectScheduler.enqueue(node);
        userHooks?.onEffectInvalidated?.(node);
      },
    });
    this.effectScheduler = new EffectScheduler(this.ctx, effectStrategy);
  }

  signal<T>(initialValue: T): Signal<T> {
    return new SignalImpl(createSignalNode(initialValue), this.ctx);
  }

  computed<T>(fn: () => T): Computed<T> {
    return createComputedAccessor(this.ctx, createComputedNode(fn));
  }

  memo<T>(fn: () => T): Computed<T> {
    const computedNode = this.computed(fn);
    computedNode();
    return computedNode;
  }

  effect(fn: () => void | (() => void)): EffectScope {
    const node = createEffectNode(fn);

    runEffect(this.ctx, node);

    return {
      node,
      dispose: () => {
        this.effectScheduler.clear(node);
        disposeEffect(node);
      },
    };
  }

  flush(): void {
    this.effectScheduler.flush();
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

    applyBatchWrite(this.ctx, nodeWrites);
  }
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  return new RuntimeImpl(options);
}
