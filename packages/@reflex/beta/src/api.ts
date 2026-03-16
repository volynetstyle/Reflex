import { ReactiveNode, ReactiveNodeState, EngineContext } from "./core.js";
//import { OrderList } from "./order.js";
//import { connect } from "./graph.js";
import {
  writeSignal,
  batchWrite,
  //run,
  ensureFresh,
} from "./engine.js";
import { trackRead } from "./tracking.js";

export interface Signal<T> {
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  node: ReactiveNode;
  (): T;
}

export const enum ComputedMode {
  Lazy = 0,
  Eager = 1,
}

export type ConputedOptions = {
  mode: ComputedMode;
};

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  //run(): number;
  batchWrite(writes: Array<[Signal<unknown>, unknown]>): void;
  //readonly list: OrderList;
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

class ComputedImpl<T> {
  constructor(
    public node: ReactiveNode,
    private ctx: EngineContext,
  ) {
    const self = this;

    const fn = function () {
      return self.read();
    } as Computed<T>;

    fn.node = node;

    return fn as unknown as this & Computed<T>;
  }

  read(): T {
    const node = this.node;

    if (this.ctx.activeComputed) trackRead(this.ctx, node);

    if (node.isDirty || node.computedAt === 0) ensureFresh(this.ctx, node);

    return node.value as T;
  }
}

export function createRuntime(): Runtime {
  //const list = new OrderList();
  const ctx = new EngineContext();

  function signal<T>(initialValue: T): Signal<T> {
    const node = new ReactiveNode(
      initialValue,
      null,
      ReactiveNodeState.Ordered,
    );

    return new SignalImpl(node, ctx);
  }

  function computed<T>(fn: () => T, options?: ConputedOptions): Computed<T> {
    const node = new ReactiveNode(undefined, fn, ReactiveNodeState.Invalid);

    return new ComputedImpl<T>(node, ctx) as unknown as Computed<T>;
  }

  return {
    signal,
    computed,
    //run: () => run(ctx, list),
    batchWrite: (writes) =>
      batchWrite(
        ctx,
        writes.map(([s, v]) => [s.node, v]),
      ),
    //list,
    ctx,
  };
}
