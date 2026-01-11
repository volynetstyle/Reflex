// ============================================================================
// T⁴ Signals MVP
// Hypothesis: Commutative events + causal coordinates = async UI without DAG
// ============================================================================

// --- T⁴ Coordinates (causal space) ---

type T4 = {
  t: number; // causal epoch
  v: number; // value version
  p: number; // async pending (implicit counter)
  s: number; // opaque hash/sequence
};

// --- State ---

type State = {
  data: Record<string, number | string | boolean>;
  coords: T4;
};

// --- Event ---

type Event = {
  patch: Partial<State["data"]>;
  dc?: Partial<T4>;
};

// --- Event Algebra (THE CORE) ---

function join(e1: Event, e2: Event): Event {
  return {
    patch: { ...e1.patch, ...e2.patch },
    dc: {
      t: (e1.dc?.t ?? 0) + (e2.dc?.t ?? 0),
      v: (e1.dc?.v ?? 0) + (e2.dc?.v ?? 0),
      p: (e1.dc?.p ?? 0) + (e2.dc?.p ?? 0),
      s: (e1.dc?.s ?? 0) + (e2.dc?.s ?? 0),
    },
  };
}

function joinAll(events: Event[]): Event {
  return events.reduce(join, { patch: {}, dc: { t: 0, v: 0, p: 0, s: 0 } });
}

function apply(state: State, event: Event): State {
  return {
    data: { ...state.data, ...event.patch } as any,
    coords: {
      t: state.coords.t + (event.dc?.t ?? 0),
      v: state.coords.v + (event.dc?.v ?? 0),
      p: state.coords.p + (event.dc?.p ?? 0),
      s: state.coords.s + (event.dc?.s ?? 0),
    },
  };
}

// --- Signals (v1: no derived-of-derived) ---

type Signal<T> = (state: State) => T;

function memo<T>(signal: Signal<T>): Signal<T> {
  let cache: { coords: T4; value: T } | null = null;

  return (state: State) => {
    if (cache && coordsEqual(cache.coords, state.coords)) {
      return cache.value;
    }

    const value = signal(state);
    cache = { coords: { ...state.coords }, value };
    return value;
  };
}

function coordsEqual(a: T4, b: T4): boolean {
  return a.t === b.t && a.v === b.v && a.p === b.p && a.s === b.s;
}

// --- Runtime ---

type RuntimeConfig = {
  onTick?: (state: State) => void;
};

function createRuntime(initial: State, config: RuntimeConfig = {}) {
  let state = initial;
  const queue: Event[] = [];
  let processing = false;

  const processTick = () => {
    if (processing) return;
    processing = true;

    const events = [...queue];
    queue.length = 0;

    if (events.length > 0) {
      const event = joinAll(events);
      state = apply(state, event);
      config.onTick?.(state);
    }

    processing = false;

    if (queue.length > 0) {
      processTick();
    }
  };

  return {
    emit(event: Event) {
      queue.push(event);
      processTick();
    },

    read<T>(signal: Signal<T>): T {
      return signal(state);
    },

    getState(): Readonly<State> {
      return state;
    },

    replay(events: Event[]) {
      events.forEach((e) => this.emit(e));
    },
  };
}

// ============================================================================
// EXPORT
// ============================================================================

// tests/helpers.ts

export const zeroCoords: T4 = { t: 0, v: 0, p: 0, s: 0 };

function makeState(data: State["data"] = {}, coords: Partial<T4> = {}): State {
  return {
    data,
    coords: { ...zeroCoords, ...coords },
  };
}

export type { T4, State, Event, Signal };
export { join, joinAll, apply, memo,  createRuntime, makeState };
