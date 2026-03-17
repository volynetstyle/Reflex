import {
  ReactiveNode,
  ReactiveNodeState,
  ReactiveNodeKind,
  EngineContext,
  isDirtyState,
  isDisposedState,
  type EngineHooks,
} from "./core.js";
import { writeSignal } from "./engine.js";
import { runEffect, disposeEffect } from "./engine/effect.js";
import { trackRead } from "./tracking.js";
import { ensureFresh, markInvalid } from "./walkers.js";

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
  effect(fn: () => void | (() => void)): EffectScope;
  flush(): void;
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
    writeSignal(this.ctx, this.node, value);
  }
}

class RuntimeImpl implements Runtime {
  readonly ctx: EngineContext;
  private readonly nodeWrites: Array<[ReactiveNode, unknown]> = [];
  private readonly pendingEffects: ReactiveNode[] = [];
  private readonly queuedEffects = new Set<ReactiveNode>();

  constructor(options?: RuntimeOptions) {
    const userHooks = options?.hooks;

    this.ctx = new EngineContext({
      ...userHooks,
      onEffectInvalidated: (node) => {
        this.enqueueEffect(node);
        userHooks?.onEffectInvalidated?.(node);
      },
    });
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

  effect(fn: () => void | (() => void)): EffectScope {
    const node = new ReactiveNode(
      undefined,
      fn,
      ReactiveNodeState.Invalid,
      ReactiveNodeKind.Effect,
    );

    runEffect(this.ctx, node);

    return {
      node,
      dispose: () => {
        this.queuedEffects.delete(node);
        disposeEffect(node);
      },
    };
  }

  flush(): void {
    const { pendingEffects, queuedEffects, ctx } = this;

    while (pendingEffects.length > 0) {
      const node = pendingEffects.shift()!;
      queuedEffects.delete(node);

      if (isDisposedState(node.state) || isDirtyState(node.state) === false) {
        continue;
      }

      runEffect(ctx, node);
    }
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

  private enqueueEffect(node: ReactiveNode): void {
    if (this.queuedEffects.has(node) || isDisposedState(node.state)) return;

    this.queuedEffects.add(node);
    this.pendingEffects.push(node);
  }
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  return new RuntimeImpl(options);
}
