// ─────────────────────────────────────────────────────────────────────────────
// State bits: три — не більше.
// Invalid  — push: хтось з предків змінився (weak signal)
// Obsolete — pull: підтверджено stale, recompute обов'язковий
// Ordered  — позиція у topo list актуальна після останнього repair
// ─────────────────────────────────────────────────────────────────────────────
export const enum ReactiveNodeState {
  Invalid = 1,
  Obsolete = 2,
  Ordered = 4,
  Tracking = 8,
}

export const CLEANUP_STATE = ~(
  ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete
);

export class ReactiveEdge {
  nextOut: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;
  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

export class ReactiveNode {
  value: unknown;
  compute: (() => unknown) | null;

  // ── Epoch versioning ─────────────────────────────────────────────────────
  // changedAt:  epoch коли value ЗМІНИЛОСЬ (тільки при Object.is = false)
  // computedAt: epoch коли вузол був RECOMPUTED (навіть якщо value не змінилось)
  //
  // Обидва потрібні: без changedAt ≠ computedAt не можна реалізувати SAC.
  // Якщо source recomputed але value не змінилось → source.changedAt НЕ зростає
  // → needsUpdate(consumer) = false → consumer не перераховується. ✓
  //
  // Overhead: 2 × SMI integer per node. Практично нуль (~0.001ns per op).
  changedAt: number;
  computedAt: number; // 0 = sentinel "ніколи не обчислювався"

  // ── tracking bit flag ───────────────────────────────────────────────────
  // true  → залежності не змінились з минулого recompute.
  //         beginTracking/finishTracking пропускаються → zero Set overhead.
  // false → перший recompute, або conditional branch міг змінити залежності.
  //
  // Встановлюється в true: після recompute якщо prevEdges порожній
  //   (жодне ребро не було видалено → граф стабільний).
  // Скидається в false: при connect() нового ребра (нова залежність),
  //   і при першому recompute (computedAt === 0).
  state: number;

  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;

  prevEdges: Set<ReactiveEdge> | null;

  constructor(value: unknown, compute: (() => unknown) | null, state: number) {
    this.value = value;
    this.compute = compute;

    this.changedAt = 0;
    this.computedAt = 0;

    this.state = state;

    this.firstOut = null;
    this.firstIn = null;

    this.prevEdges = null;
  }

  get isSignal() {
    return this.compute === null;
  }

  get isDirty() {
    return (
      (this.state &
        (ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete)) !==
      0
    );
  }
}

export class EngineContext {
  firstDirty: ReactiveNode | null = null;
  epoch: number = 1; // починаємо з 1: computedAt=0 = never computed
  activeComputed: ReactiveNode | null = null;
  readonly trawelList: ReactiveNode[] = [];
  readonly worklist: ReactiveNode[] = [];

  bumpEpoch() {
    return ++this.epoch;
  }
  getEpoch() {
    return this.epoch;
  }
}
