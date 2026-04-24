import { afterAll, bench, describe } from "vitest";

import {
  batch,
  createProjection as createReflexProjection,
  createRuntime,
  effect,
  flush,
  signal,
  withEffectCleanupRegistrar,
} from "../dist/esm/unstable/index.js";
import * as SolidSignalsModule from "../../@volynets/reflex-runtime/node_modules/@solidjs/signals/dist/prod.js";

// ---------------------------------------------------------------------------
// Solid bindings
// ---------------------------------------------------------------------------

const {
  createEffect,
  createProjection: createSolidProjection,
  createRoot,
  createSignal,
  flush: solidflush,
  getOwner,
  runWithOwner,
} = SolidSignalsModule as unknown as {
  createEffect<T>(
    compute: () => T,
    effectFn: (value: T, prev?: T) => void,
  ): void;
  createProjection<T extends object>(fn: (draft: T) => void, initialValue?: T): T;
  createRoot<T>(init: (dispose: () => void) => T): T;
  createSignal<T>(initial?: T): [read: () => T, write: (value: T | ((prev: T) => T)) => T];
  flush(): void;
  getOwner(): unknown;
  runWithOwner<T>(owner: unknown, fn: () => T): T;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARMUP_ITERATIONS = 150;
const ITERATIONS       = 1_000;

// Row counts per tier
const TINY   = 10;
const SMALL  = 100;
const MEDIUM = 1_000;   // default
const LARGE  = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blackhole(value: unknown): void { void value; }

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`[bench validation] ${message}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchCase {
  step(): void;
  dispose(): void;
}

interface Entity {
  id: number;
  label: string;
}

interface MultiEntity {
  ids: number[];
  labels: string[];
}

type SelectionMode = "switch" | "noop";
type EntityMode    = "switch" | "same-key" | "noop";

// ---------------------------------------------------------------------------
// Solid owner helper
// ---------------------------------------------------------------------------

function createSolidOwner(): { withOwner: <T>(fn: () => T) => T; dispose: () => void } {
  let owner: unknown;
  let dispose = () => {};
  createRoot((d) => { dispose = d; owner = getOwner(); return undefined; });
  if (owner === undefined) throw new Error("Failed to create Solid reactive owner");
  return { withOwner: <T>(fn: () => T) => runWithOwner(owner, fn), dispose };
}

// ---------------------------------------------------------------------------
// Bench registry
// ---------------------------------------------------------------------------

function registerCase(title: string, factory: () => BenchCase): void {
  let instance: BenchCase | null = null;
  describe(title, () => {
    afterAll(() => { instance?.dispose(); instance = null; });
    bench("run", () => {
      instance ??= factory();
      instance.step();
    }, { warmupIterations: WARMUP_ITERATIONS, iterations: ITERATIONS });
  });
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function validateCase(
  label: string,
  factory: () => BenchCase,
  check: (step: number, instance: BenchCase) => void,
  steps = 6,
): void {
  const instance = factory();
  try {
    for (let i = 0; i < steps; i++) { instance.step(); check(i, instance); }
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}:`, err);
    throw err;
  } finally {
    instance.dispose();
  }
}

// ===========================================================================
// TIER 1 — SINGLE-KEY SELECTION
// One signal → boolean projection over N rows. Only 1 row is ever "active".
// Models: list row highlight, tab selection, accordion open state.
// ===========================================================================

type SelectionCase = BenchCase & { readProjection(id: number): boolean };

function createReflexSelectionCase(rows = MEDIUM, mode: SelectionMode = "switch"): SelectionCase {
  createRuntime({ effectStrategy: "flush" });
  const [selected, setSelected] = signal<number | undefined>(undefined);
  const cleanups: Array<() => void> = [];
  const projection = withEffectCleanupRegistrar(
    (c) => { cleanups.push(c); },
    () => createReflexProjection(selected, (v) => v, (v) => v !== undefined, { fallback: false, priority: 100 }),
  );
  const disposers: Array<() => void> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const idx = i;
    disposers[i] = effect(() => { blackhole(projection(idx)); });
  }
  let next = 0;
  return {
    step() {
      if (mode === "switch") next = (next + 1) % rows;
      setSelected(next);
      flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!();
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
    },
    readProjection: (id) => projection(id),
  };
}

function createSolidSelectionCase(rows = MEDIUM, mode: SelectionMode = "switch"): SelectionCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const [selected, setSelected] = withOwner(() => createSignal<number | undefined>(undefined));
  let previous: number | undefined;
  const projection = withOwner(() =>
    createSolidProjection<Record<number, boolean>>((draft) => {
      const cur = selected();
      if (previous !== undefined && previous !== cur) delete draft[previous];
      if (cur !== undefined) draft[cur] = true;
      previous = cur;
    }, {}),
  );
  for (let i = 0; i < rows; i++) {
    const idx = i;
    withOwner(() => createEffect(() => projection[idx], (v) => { blackhole(v); }));
  }
  let next = 0;
  return {
    step() {
      if (mode === "switch") next = (next + 1) % rows;
      setSelected(next);
      solidflush();
    },
    dispose() { disposeRoot(); },
    readProjection: (id) => projection[id] ?? false,
  };
}

// ===========================================================================
// TIER 2 — SINGLE ENTITY LABEL (one key, one value)
// One signal<Entity> → label projection. Single active slot moves around.
// Models: "active item" metadata display.
// ===========================================================================

type EntityCase = BenchCase & { readLabel(id: number): string | undefined };

function createReflexEntityCase(rows = MEDIUM, mode: EntityMode = "switch"): EntityCase {
  createRuntime({ effectStrategy: "flush" });
  const [entity, setEntity] = signal<Entity>({ id: 0, label: "label-0" });
  const cleanups: Array<() => void> = [];
  const labels = withEffectCleanupRegistrar(
    (c) => { cleanups.push(c); },
    () => createReflexProjection(entity, (v) => v.id, (v) => v.label, { fallback: undefined, priority: 100 }),
  );
  const disposers: Array<() => void> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const idx = i;
    disposers[i] = effect(() => { blackhole(labels(idx)); });
  }
  let next = 0;
  let ver  = 0;
  return {
    step() {
      if (mode === "switch")    { next = (next + 1) % rows; ver = next; setEntity({ id: next, label: `label-${ver}` }); }
      else if (mode === "same-key") { ver++; setEntity({ id: next, label: `label-${ver}` }); }
      else                      { setEntity({ id: next, label: `label-${ver}` }); }
      flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!();
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
    },
    readLabel: (id) => labels(id),
  };
}

function createSolidEntityCase(rows = MEDIUM, mode: EntityMode = "switch"): EntityCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const [entity, setEntity] = withOwner(() => createSignal<Entity>({ id: 0, label: "label-0" }));
  let previous: number | undefined;
  const projection = withOwner(() =>
    createSolidProjection<Record<number, string | undefined>>((draft) => {
      const cur = entity();
      if (previous !== undefined && previous !== cur.id) delete draft[previous];
      draft[cur.id] = cur.label;
      previous = cur.id;
    }, {}),
  );
  for (let i = 0; i < rows; i++) {
    const idx = i;
    withOwner(() => createEffect(() => projection[idx], (v) => { blackhole(v); }));
  }
  let next = 0;
  let ver  = 0;
  return {
    step() {
      if (mode === "switch")        { next = (next + 1) % rows; ver = next; setEntity({ id: next, label: `label-${ver}` }); }
      else if (mode === "same-key") { ver++; setEntity({ id: next, label: `label-${ver}` }); }
      else                          { setEntity({ id: next, label: `label-${ver}` }); }
      solidflush();
    },
    dispose() { disposeRoot(); },
    readLabel: (id) => projection[id],
  };
}

// ===========================================================================
// TIER 3 — MULTI-SELECTION (K simultaneous active rows)
// One write → K rows become true, K old rows become false.
// Models: multi-select checkboxes, drag selection, bulk actions.
// ===========================================================================

const MULTI_K = 5; // simultaneous active rows

type MultiSelCase = BenchCase & { readProjection(id: number): boolean };

function createReflexMultiSelectionCase(rows = MEDIUM, k = MULTI_K): MultiSelCase {
  createRuntime({ effectStrategy: "flush" });
  const [selected, setSelected] = signal<ReadonlySet<number>>(new Set());
  const rowProjections = Array.from({ length: rows }, (_, idx) => {
    const [s, setS] = signal(false);
    const d = effect(() => {
      const inSet = selected()?.has(idx) ?? false;
      setS(inSet);
      blackhole(s());
    });
    return { read: s, dispose: d };
  });

  let cursor = 0;
  return {
    step() {
      const next = new Set<number>();
      for (let i = 0; i < k; i++) next.add((cursor + i) % rows);
      cursor = (cursor + 1) % rows;
      setSelected(next);
      flush();
    },
    dispose() {
      for (let i = rowProjections.length - 1; i >= 0; i--) rowProjections[i]!.dispose();
    },
    readProjection: (id) => rowProjections[id]?.read() ?? false,
  };
}

function createSolidMultiSelectionCase(rows = MEDIUM, k = MULTI_K): MultiSelCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const [selected, setSelected] = withOwner(() => createSignal<ReadonlySet<number>>(new Set()));
  const rowProjections = Array.from({ length: rows }, (_, idx) =>
    withOwner(() => {
      const [s, setS] = createSignal(false);
      createEffect(() => selected().has(idx), (v) => {
        setS(v);
        blackhole(s());
      });
      return { read: s };
    }),
  );
  let cursor = 0;
  return {
    step() {
      const next = new Set<number>();
      for (let i = 0; i < k; i++) next.add((cursor + i) % rows);
      cursor = (cursor + 1) % rows;
      setSelected(next);
      solidflush();
    },
    dispose() { disposeRoot(); },
    readProjection: (id) => rowProjections[id]?.read() ?? false,
  };
}

// ===========================================================================
// TIER 4 — MULTI-ENTITY BATCH (write K entities at once)
// One signal<MultiEntity> → per-id label projection updated for K slots.
// Models: virtualized list refresh, batch API responses.
// ===========================================================================

const BATCH_K = 10;

type BatchEntityCase = BenchCase & { readLabel(id: number): string | undefined };

function createReflexBatchEntityCase(rows = MEDIUM, k = BATCH_K): BatchEntityCase {
  createRuntime({ effectStrategy: "flush" });
  const [batchState, setBatch] = signal<MultiEntity>({ ids: [], labels: [] });
  // `createProjection()` is single-keyed; this tier mutates K row ids at once.
  // Fan the current batch out into per-row signals so the workload stays keyed.
  const rowSignals: Array<{
    read: () => string | undefined;
    write: (value: string | undefined) => string | undefined;
    dispose: () => void;
  }> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const [s, setS] = signal<string | undefined>(undefined);
    rowSignals[i] = {
      read: s,
      write: setS,
      dispose: effect(() => { blackhole(s()); }),
    };
  }
  let previousIds: number[] = [];
  const syncDispose = effect(() => {
    const current = batchState();
    batch(() => {
      for (let i = 0; i < previousIds.length; i++) {
        rowSignals[previousIds[i]]!.write(undefined);
      }
      for (let i = 0; i < current.ids.length; i++) {
        rowSignals[current.ids[i]]!.write(current.labels[i]);
      }
      previousIds = current.ids.slice();
    });
  });

  let cursor = 0;
  return {
    step() {
      const ids: number[]    = [];
      const lbls: string[] = [];
      for (let i = 0; i < k; i++) {
        const id = (cursor + i) % rows;
        ids.push(id);
        lbls.push(`label-${id}-v${cursor}`);
      }
      cursor = (cursor + 1) % rows;
      setBatch({ ids, labels: lbls });
      flush();
    },
    dispose() {
      syncDispose();
      for (let i = rowSignals.length - 1; i >= 0; i--) rowSignals[i]!.dispose();
    },
    readLabel: (id) => rowSignals[id]?.read(),
  };
}

function createSolidBatchEntityCase(rows = MEDIUM, k = BATCH_K): BatchEntityCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const [batchState, setBatch] = withOwner(() =>
    createSignal<MultiEntity>({ ids: [], labels: [] }),
  );
  const rowSignals = Array.from({ length: rows }, () =>
    withOwner(() => {
      const [s, setS] = createSignal<string | undefined>(undefined);
      createEffect(() => s(), (v) => { blackhole(v); });
      return { read: s, write: setS };
    }),
  );
  let previousIds: number[] = [];
  withOwner(() =>
    createEffect(() => batchState(), (current) => {
      for (let i = 0; i < previousIds.length; i++) {
        rowSignals[previousIds[i]]!.write(undefined);
      }
      for (let i = 0; i < current.ids.length; i++) {
        rowSignals[current.ids[i]]!.write(current.labels[i]);
      }
      previousIds = current.ids.slice();
    }),
  );
  let cursor = 0;
  return {
    step() {
      const ids: number[]  = [];
      const lbls: string[] = [];
      for (let i = 0; i < k; i++) {
        const id = (cursor + i) % rows;
        ids.push(id);
        lbls.push(`label-${id}-v${cursor}`);
      }
      cursor = (cursor + 1) % rows;
      setBatch({ ids, labels: lbls });
      solidflush();
    },
    dispose() { disposeRoot(); },
    readLabel: (id) => rowSignals[id]?.read(),
  };
}

// ===========================================================================
// TIER 5 — HIGH-CHURN: random access pattern
// Instead of walking ids sequentially, pick pseudo-random ids each step.
// Models: search-as-you-type highlight, graph node hover, random focus.
// ===========================================================================

// Fast LCG so the pattern is deterministic but non-sequential
function makeLCG(seed = 1337) {
  let s = seed;
  return (max: number) => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s % max; };
}

type ChurnCase = BenchCase & { readLabel(id: number): string | undefined };

function createReflexChurnCase(rows = MEDIUM): ChurnCase {
  createRuntime({ effectStrategy: "flush" });
  const lcg = makeLCG();
  const [entity, setEntity] = signal<Entity>({ id: 0, label: "label-0" });
  const cleanups: Array<() => void> = [];
  const labels = withEffectCleanupRegistrar(
    (c) => { cleanups.push(c); },
    () => createReflexProjection(entity, (v) => v.id, (v) => v.label, { fallback: undefined, priority: 100 }),
  );
  const disposers: Array<() => void> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const idx = i;
    disposers[i] = effect(() => { blackhole(labels(idx)); });
  }
  return {
    step() {
      const id = lcg(rows);
      setEntity({ id, label: `lbl-${id}` });
      flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!();
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
    },
    readLabel: (id) => labels(id),
  };
}

function createSolidChurnCase(rows = MEDIUM): ChurnCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const lcg = makeLCG();
  const [entity, setEntity] = withOwner(() => createSignal<Entity>({ id: 0, label: "label-0" }));
  let previous: number | undefined;
  const projection = withOwner(() =>
    createSolidProjection<Record<number, string | undefined>>((draft) => {
      const cur = entity();
      if (previous !== undefined && previous !== cur.id) delete draft[previous];
      draft[cur.id] = cur.label;
      previous = cur.id;
    }, {}),
  );
  for (let i = 0; i < rows; i++) {
    const idx = i;
    withOwner(() => createEffect(() => projection[idx], (v) => { blackhole(v); }));
  }
  return {
    step() {
      const id = lcg(rows);
      setEntity({ id, label: `lbl-${id}` });
      solidflush();
    },
    dispose() { disposeRoot(); },
    readLabel: (id) => projection[id],
  };
}

// ===========================================================================
// TIER 6 — FULL-SWEEP: every row changes every step
// All N rows receive a new value simultaneously via one signal write.
// Models: sort/filter change that remaps the entire list, theme toggle.
// ===========================================================================

type SweepCase = BenchCase & { readLabel(id: number): string | undefined };

function createReflexSweepCase(rows = SMALL): SweepCase {
  createRuntime({ effectStrategy: "flush" });
  // Signal carries a "version" — all row labels derive from it
  const [version, setVersion] = signal(0);
  const cleanups: Array<() => void> = [];
  const labels = withEffectCleanupRegistrar(
    (c) => { cleanups.push(c); },
    () => createReflexProjection(
      version,
      (v) => v,          // key = version itself (changes every step)
      (v) => `v${v}`,    // value = version string (all rows share it)
      { fallback: undefined, priority: 100 },
    ),
  );
  const disposers: Array<() => void> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const idx = i;
    disposers[i] = effect(() => { blackhole(labels(idx)); });
  }
  let v = 0;
  return {
    step() { setVersion(++v); flush(); },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!();
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
    },
    readLabel: (id) => labels(id) as string | undefined,
  };
}

function createReflexSweepCaseFixed(rows = SMALL): SweepCase {
  createRuntime({ effectStrategy: "flush" });
  const [version, setVersion] = signal(0);
  const rowSignals: Array<{
    read: () => string | undefined;
    write: (value: string | undefined) => string | undefined;
    dispose: () => void;
  }> = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const [s, setS] = signal<string | undefined>(undefined);
    rowSignals[i] = {
      read: s,
      write: setS,
      dispose: effect(() => { blackhole(s()); }),
    };
  }
  const syncDispose = effect(() => {
    const label = `v${version()}`;
    batch(() => {
      for (let i = 0; i < rows; i++) {
        rowSignals[i]!.write(label);
      }
    });
  });
  let v = 0;
  return {
    step() { setVersion(++v); flush(); },
    dispose() {
      syncDispose();
      for (let i = rowSignals.length - 1; i >= 0; i--) rowSignals[i]!.dispose();
    },
    readLabel: (id) => rowSignals[id]?.read(),
  };
}

function createSolidSweepCase(rows = SMALL): SweepCase {
  const { withOwner, dispose: disposeRoot } = createSolidOwner();
  const [version, setVersion] = withOwner(() => createSignal(0));
  const rowSignals = Array.from({ length: rows }, () =>
    withOwner(() => {
      const [s, setS] = createSignal<string | undefined>(undefined);
      createEffect(() => s(), (v) => { blackhole(v); });
      return { read: s, write: setS };
    }),
  );
  withOwner(() =>
    createEffect(() => version(), (v) => {
      const label = `v${v}`;
      for (let i = 0; i < rows; i++) {
        rowSignals[i]!.write(label);
      }
    }),
  );
  let v = 0;
  return {
    step() { setVersion(++v); solidflush(); },
    dispose() { disposeRoot(); },
    readLabel: (id) => rowSignals[id]?.read(),
  };
}

// ===========================================================================
// VALIDATION
// ===========================================================================

console.log("\n=== Projection Benchmark Validation ===");

// T1 – Selection switch
validateCase(
  "T1 reflex selection switch",
  () => createReflexSelectionCase(10, "switch"),
  (step, inst) => {
    const c = inst as SelectionCase;
    const active = (step + 1) % 10;
    for (let i = 0; i < 10; i++)
      assert(c.readProjection(i) === (i === active), `row ${i}: expected ${i === active}`);
  },
);
validateCase(
  "T1 solid selection switch",
  () => createSolidSelectionCase(10, "switch"),
  (step, inst) => {
    const c = inst as SelectionCase;
    const active = (step + 1) % 10;
    for (let i = 0; i < 10; i++)
      assert(c.readProjection(i) === (i === active), `row ${i}: expected ${i === active}`);
  },
);
validateCase(
  "T1 reflex selection noop – stays at 0",
  () => createReflexSelectionCase(10, "noop"),
  (step, inst) => {
    const c = inst as SelectionCase;
    assert(c.readProjection(0) === true, `row 0 must be true`);
    for (let i = 1; i < 10; i++) assert(!c.readProjection(i), `row ${i} must be false`);
  },
);
validateCase(
  "T1 parity reflex vs solid selection switch",
  () => {
    const r = createReflexSelectionCase(20, "switch");
    const s = createSolidSelectionCase(20, "switch");
    return {
      step() { r.step(); s.step(); },
      dispose() { r.dispose(); s.dispose(); },
      r, s,
    };
  },
  (step, inst) => {
    const c = inst as { r: SelectionCase; s: SelectionCase };
    const active = (step + 1) % 20;
    for (let i = 0; i < 20; i++) {
      const rv = c.r.readProjection(i), sv = c.s.readProjection(i);
      assert(rv === sv, `row ${i}: reflex=${rv} solid=${sv} mismatch`);
      assert(rv === (i === active), `row ${i}: expected ${i === active}, got ${rv}`);
    }
  },
);

// T2 – Entity switch / same-key / noop
validateCase(
  "T2 reflex entity switch – active label matches id",
  () => createReflexEntityCase(10, "switch"),
  (step, inst) => {
    const c = inst as EntityCase;
    const active = (step + 1) % 10;
    assert(c.readLabel(active) === `label-${active}`, `label mismatch at active=${active}`);
    const prev = step % 10;
    if (prev !== active) assert(c.readLabel(prev) === undefined, `prev=${prev} should be cleared`);
  },
);
validateCase(
  "T2 reflex entity same-key – label updates",
  () => createReflexEntityCase(10, "same-key"),
  (step, inst) => {
    const c = inst as EntityCase;
    assert(c.readLabel(0) === `label-${step + 1}`, `label for id 0 at step ${step}`);
  },
);
validateCase(
  "T2 reflex entity noop – stable",
  () => createReflexEntityCase(10, "noop"),
  (step, inst) => {
    assert((inst as EntityCase).readLabel(0) === "label-0", `should be label-0 at step ${step}`);
  },
);
validateCase(
  "T2 solid entity switch – active label matches id",
  () => createSolidEntityCase(10, "switch"),
  (step, inst) => {
    const c = inst as EntityCase;
    const active = (step + 1) % 10;
    assert(c.readLabel(active) === `label-${active}`, `label mismatch at active=${active}`);
    const prev = step % 10;
    if (prev !== active) assert(c.readLabel(prev) === undefined, `prev=${prev} should be cleared`);
  },
);

// T3 – Multi-selection
validateCase(
  "T3 reflex multi-selection – exactly K rows active",
  () => createReflexMultiSelectionCase(20, 3),
  (step, inst) => {
    const c = inst as MultiSelCase;
    let count = 0;
    for (let i = 0; i < 20; i++) if (c.readProjection(i)) count++;
    assert(count === 3, `expected 3 active rows, got ${count}`);
  },
);
validateCase(
  "T3 solid multi-selection – exactly K rows active",
  () => createSolidMultiSelectionCase(20, 3),
  (step, inst) => {
    const c = inst as MultiSelCase;
    let count = 0;
    for (let i = 0; i < 20; i++) if (c.readProjection(i)) count++;
    assert(count === 3, `expected 3 active rows, got ${count}`);
  },
);

// T4 – Batch entity
validateCase(
  "T4 reflex batch – updated rows have new labels",
  () => createReflexBatchEntityCase(20, 4),
  (step, inst) => {
    const c = inst as BatchEntityCase;
    // cursor starts at 0, after step 0 it becomes 1 — batch was ids [0,1,2,3] ver 0
    const cursor = step; // cursor before increment
    for (let i = 0; i < 4; i++) {
      const id = (cursor + i) % 20;
      assert(
        c.readLabel(id) === `label-${id}-v${cursor}`,
        `step ${step}: id ${id} expected "label-${id}-v${cursor}", got "${c.readLabel(id)}"`,
      );
    }
  },
);
validateCase(
  "T4 solid batch – updated rows have new labels",
  () => createSolidBatchEntityCase(20, 4),
  (step, inst) => {
    const c = inst as BatchEntityCase;
    const cursor = step;
    for (let i = 0; i < 4; i++) {
      const id = (cursor + i) % 20;
      assert(
        c.readLabel(id) === `label-${id}-v${cursor}`,
        `step ${step}: id ${id} expected "label-${id}-v${cursor}", got "${c.readLabel(id)}"`,
      );
    }
  },
);

// T5 – Churn: just verify something is set (LCG is deterministic)
validateCase(
  "T5 reflex churn – active id is non-empty",
  () => createReflexChurnCase(20),
  (_, inst) => {
    const c = inst as ChurnCase;
    let found = false;
    for (let i = 0; i < 20; i++) if (c.readLabel(i) !== undefined) { found = true; break; }
    assert(found, "at least one row should have a label");
  },
);
validateCase(
  "T5 solid churn – active id is non-empty",
  () => createSolidChurnCase(20),
  (_, inst) => {
    const c = inst as ChurnCase;
    let found = false;
    for (let i = 0; i < 20; i++) if (c.readLabel(i) !== undefined) { found = true; break; }
    assert(found, "at least one row should have a label");
  },
);

// T6 – Full sweep: all rows share the same version label
validateCase(
  "T6 reflex sweep – all rows updated to current version",
  () => createReflexSweepCaseFixed(10),
  (step, inst) => {
    const c = inst as SweepCase;
    const expected = `v${step + 1}`;
    for (let i = 0; i < 10; i++)
      assert(c.readLabel(i) === expected, `row ${i}: expected "${expected}", got "${c.readLabel(i)}"`);
  },
);
validateCase(
  "T6 solid sweep – all rows updated to current version",
  () => createSolidSweepCase(10),
  (step, inst) => {
    const c = inst as SweepCase;
    const expected = `v${step + 1}`;
    for (let i = 0; i < 10; i++)
      assert(c.readLabel(i) === expected, `row ${i}: expected "${expected}", got "${c.readLabel(i)}"`);
  },
);

console.log("=== Validation complete ===\n");

// ===========================================================================
// BENCHMARK REGISTRATION
// ===========================================================================

// ── T1: Single-key selection ────────────────────────────────────────────────
registerCase("T1 reflex | selection | switch | 1k rows",   () => createReflexSelectionCase(MEDIUM, "switch"));
registerCase("T1 solid  | selection | switch | 1k rows",   () => createSolidSelectionCase(MEDIUM, "switch"));
registerCase("T1 reflex | selection | noop   | 1k rows",   () => createReflexSelectionCase(MEDIUM, "noop"));
registerCase("T1 solid  | selection | noop   | 1k rows",   () => createSolidSelectionCase(MEDIUM, "noop"));

// Scale
registerCase("T1 reflex | selection | switch | 100 rows",  () => createReflexSelectionCase(SMALL,  "switch"));
registerCase("T1 solid  | selection | switch | 100 rows",  () => createSolidSelectionCase(SMALL,  "switch"));
registerCase("T1 reflex | selection | switch | 10k rows",  () => createReflexSelectionCase(LARGE,  "switch"));
registerCase("T1 solid  | selection | switch | 10k rows",  () => createSolidSelectionCase(LARGE,  "switch"));

// ── T2: Single entity label ──────────────────────────────────────────────────
registerCase("T2 reflex | entity | switch   | 1k rows",    () => createReflexEntityCase(MEDIUM, "switch"));
registerCase("T2 solid  | entity | switch   | 1k rows",    () => createSolidEntityCase(MEDIUM, "switch"));
registerCase("T2 reflex | entity | same-key | 1k rows",    () => createReflexEntityCase(MEDIUM, "same-key"));
registerCase("T2 solid  | entity | same-key | 1k rows",    () => createSolidEntityCase(MEDIUM, "same-key"));
registerCase("T2 reflex | entity | noop     | 1k rows",    () => createReflexEntityCase(MEDIUM, "noop"));
registerCase("T2 solid  | entity | noop     | 1k rows",    () => createSolidEntityCase(MEDIUM, "noop"));

// Scale
registerCase("T2 reflex | entity | switch   | 100 rows",   () => createReflexEntityCase(SMALL,  "switch"));
registerCase("T2 solid  | entity | switch   | 100 rows",   () => createSolidEntityCase(SMALL,  "switch"));
registerCase("T2 reflex | entity | switch   | 10k rows",   () => createReflexEntityCase(LARGE,  "switch"));
registerCase("T2 solid  | entity | switch   | 10k rows",   () => createSolidEntityCase(LARGE,  "switch"));

// ── T3: Multi-selection (K=5 simultaneous active rows) ──────────────────────
registerCase("T3 reflex | multi-sel k=5 | 1k rows",        () => createReflexMultiSelectionCase(MEDIUM, MULTI_K));
registerCase("T3 solid  | multi-sel k=5 | 1k rows",        () => createSolidMultiSelectionCase(MEDIUM, MULTI_K));
registerCase("T3 reflex | multi-sel k=20 | 1k rows",       () => createReflexMultiSelectionCase(MEDIUM, 20));
registerCase("T3 solid  | multi-sel k=20 | 1k rows",       () => createSolidMultiSelectionCase(MEDIUM, 20));

// ── T4: Batch entity (K=10 entities per write) ──────────────────────────────
registerCase("T4 reflex | batch k=10 | 1k rows",           () => createReflexBatchEntityCase(MEDIUM, BATCH_K));
registerCase("T4 solid  | batch k=10 | 1k rows",           () => createSolidBatchEntityCase(MEDIUM, BATCH_K));
registerCase("T4 reflex | batch k=50 | 1k rows",           () => createReflexBatchEntityCase(MEDIUM, 50));
registerCase("T4 solid  | batch k=50 | 1k rows",           () => createSolidBatchEntityCase(MEDIUM, 50));
registerCase("T4 reflex | batch k=10 | 10k rows",          () => createReflexBatchEntityCase(LARGE,  BATCH_K));
registerCase("T4 solid  | batch k=10 | 10k rows",          () => createSolidBatchEntityCase(LARGE,  BATCH_K));

// ── T5: High-churn random access ────────────────────────────────────────────
registerCase("T5 reflex | churn random | 100 rows",        () => createReflexChurnCase(SMALL));
registerCase("T5 solid  | churn random | 100 rows",        () => createSolidChurnCase(SMALL));
registerCase("T5 reflex | churn random | 1k rows",         () => createReflexChurnCase(MEDIUM));
registerCase("T5 solid  | churn random | 1k rows",         () => createSolidChurnCase(MEDIUM));
registerCase("T5 reflex | churn random | 10k rows",        () => createReflexChurnCase(LARGE));
registerCase("T5 solid  | churn random | 10k rows",        () => createSolidChurnCase(LARGE));

// ── T6: Full-sweep (every row changes) ──────────────────────────────────────
registerCase("T6 reflex | full-sweep | 10 rows",           () => createReflexSweepCaseFixed(TINY));
registerCase("T6 solid  | full-sweep | 10 rows",           () => createSolidSweepCase(TINY));
registerCase("T6 reflex | full-sweep | 100 rows",          () => createReflexSweepCaseFixed(SMALL));
registerCase("T6 solid  | full-sweep | 100 rows",          () => createSolidSweepCase(SMALL));
registerCase("T6 reflex | full-sweep | 1k rows",           () => createReflexSweepCaseFixed(MEDIUM));
registerCase("T6 solid  | full-sweep | 1k rows",           () => createSolidSweepCase(MEDIUM));
