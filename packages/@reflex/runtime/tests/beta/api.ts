import { ReactiveNode, ReactiveNodeState, EngineContext } from "./core.js";
import { OrderList } from "./order.js";
import { connect } from "./graph.js";
import {
  writeSignal,
  batchWrite,
  run,
  recompute,
  needsUpdate,
  ensureFresh,
  trackRead,
} from "./engine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
//
// signal<T>(value)         → { read, write }
// computed<T>(fn)          → () => T   (lazy — не обчислюється до read)
// runtime.run()            → eager scan всього графа (для observers)
// ─────────────────────────────────────────────────────────────────────────────

export interface Signal<T> {
  readonly node: ReactiveNode;
  read(): T;
  write(value: T): void;
}

export interface Computed<T> {
  node: ReactiveNode;
  (): T;
}

export interface Runtime {
  signal<T>(value: T): Signal<T>;
  computed<T>(fn: () => T): Computed<T>;
  run(): number;
  batchWrite(writes: Array<[Signal<unknown>, unknown]>): void;
  readonly list: OrderList;
  readonly ctx: EngineContext;
}

export function createRuntime(): Runtime {
  const list = new OrderList();
  const ctx = new EngineContext();

  // ── signal ──────────────────────────────────────────────────
  function signal<T>(initialValue: T): Signal<T> {
    const node = new ReactiveNode();
    node.payload = initialValue;
    node.compute = null;
    node.changedAt = 0;
    node.computedAt = 0;
    node.state = ReactiveNodeState.Ordered;
    list.push(node);

    function read(): T {
      // Якщо є activeComputed — реєструємо залежність
      if (ctx.activeComputed) {
        trackRead(ctx, node, list);
      }
      return node.payload as T;
    }

    return {
      node,
      read,
      write: (value: T) => writeSignal(ctx, node, value),
    };
  }

  // ── computed ─────────────────────────────────────────────────
  // LAZY: не обчислюється при створенні.
  // Залежності відкриваються автоматично під час першого read().
  function computed<T>(fn: () => T): Computed<T> {
    const node = new ReactiveNode();
    node.compute = fn as () => unknown;
    node.payload = undefined;
    node.changedAt = 0;
    node.computedAt = 0;
    // Починаємо як Invalid — щоб перше read() тригернуло recompute
    node.state = ReactiveNodeState.Invalid | ReactiveNodeState.Ordered;

    // Вставляємо в кінець списку (перед першим read ще не знаємо джерела)
    list.push(node);

    function read(): T {
      // Якщо є activeComputed зовні — реєструємо цей вузол як залежність
      if (ctx.activeComputed) {
        trackRead(ctx, node, list);
      }

      // Lazy pull: оновити якщо dirty
      if (node.isDirty) {
        ensureFresh(ctx, node, list);
      }

      return node.payload as T;
    }

    // computed повертає функцію що також є об'єктом з .node
    const readFn = read as Computed<T>;
    readFn.node = node;
    return readFn;
  }

  return {
    signal,
    computed,
    run: () => run(ctx, list),
    batchWrite: (writes) =>
      batchWrite(
        ctx,
        writes.map(([s, v]) => [s.node, v]),
      ),
    list,
    ctx,
  };
}
