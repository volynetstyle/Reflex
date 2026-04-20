import { afterAll, bench, describe } from "vitest";

import {
  createRuntime,
  createStoreProjection as createReflexStoreProjection,
  effect,
  flush,
  signal,
} from "../dist/esm/unstable/index.js";
import * as SolidSignalsModule from "../../@reflex/runtime/node_modules/@solidjs/signals/dist/prod.js";

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
  createProjection<T extends object>(
    fn: (draft: T) => void,
    initialValue?: T,
  ): T;
  createRoot<T>(init: (dispose: () => void) => T): T;
  createSignal<T>(
    initial?: T,
  ): [read: () => T, write: (value: T | ((prev: T) => T)) => T];
  flush(): void;
  getOwner(): unknown;
  runWithOwner<T>(owner: unknown, fn: () => T): T;
};

const WARMUP_ITERATIONS = 120;
const ITERATIONS = 900;

const SMALL = 100;
const MEDIUM = 1_000;

function blackhole(value: unknown): void {
  void value;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`[bench validation] ${message}`);
}

interface BenchCase {
  step(): void;
  dispose(): void;
}

interface FlatCase extends BenchCase {
  readCount(): number;
  readDoubled(): number;
}

interface NestedCase extends BenchCase {
  readFullName(): string;
  readInitials(): string;
}

interface RecordCase extends BenchCase {
  readLabel(id: number): string | undefined;
}

interface BaselineCase extends BenchCase {
  readPayload(): PreparedBatchPayload;
}

interface BatchPayload {
  ids: number[];
  labels: string[];
}

interface PreparedBatchPayload extends BatchPayload {
  previousIds: number[];
}

function createSolidOwner(): {
  withOwner: <T>(fn: () => T) => T;
  dispose: () => void;
} {
  let owner: unknown;
  let dispose = () => {};
  createRoot((d) => {
    dispose = d;
    owner = getOwner();
    return undefined;
  });
  if (owner === undefined) {
    throw new Error("Failed to create Solid reactive owner");
  }
  return { withOwner: <T>(fn: () => T) => runWithOwner(owner, fn), dispose };
}

function buildLabelTable(rows: number): string[][] {
  const table = Array.from({ length: rows }, () => new Array<string>(rows));
  for (let version = 0; version < rows; version++) {
    for (let id = 0; id < rows; id++) {
      table[version]![id] = `label-${id}-v${version}`;
    }
  }
  return table;
}

function createPreparedRecordPayloadFactory(
  rows: number,
  width: number,
): () => PreparedBatchPayload {
  const labelTable = buildLabelTable(rows);
  const slotCount = 2;
  const idsBuffers = Array.from({ length: slotCount }, () =>
    Array.from({ length: width }, () => 0),
  );
  const labelsBuffers = Array.from({ length: slotCount }, () =>
    Array.from({ length: width }, () => ""),
  );
  const previousIdsBuffers = Array.from({ length: slotCount }, () =>
    Array.from({ length: width }, () => 0),
  );
  const payloads = Array.from({ length: slotCount }, (_, slot) => ({
    ids: idsBuffers[slot]!,
    labels: labelsBuffers[slot]!,
    previousIds: previousIdsBuffers[slot]!,
  }));
  let cursor = 0;
  let slot = 0;

  return () => {
    const current = payloads[slot]!;
    const previous = payloads[(slot + slotCount - 1) % slotCount]!;

    for (let i = 0; i < width; i++) {
      current.previousIds[i] = previous.ids[i]!;
      const id = (cursor + i) % rows;
      current.ids[i] = id;
      current.labels[i] = labelTable[cursor]![id]!;
    }

    cursor = (cursor + 1) % rows;
    slot = (slot + 1) % slotCount;
    return current;
  };
}

function createEmptyPreparedPayload(width: number): PreparedBatchPayload {
  return {
    ids: Array.from({ length: width }, () => 0),
    labels: Array.from({ length: width }, () => ""),
    previousIds: Array.from({ length: width }, () => -1),
  };
}

function registerCase(title: string, factory: () => BenchCase): void {
  let instance: BenchCase | null = null;
  describe(title, () => {
    afterAll(() => {
      instance?.dispose();
      instance = null;
    });
    bench(
      "run",
      () => {
        instance ??= factory();
        instance.step();
      },
      { warmupIterations: WARMUP_ITERATIONS, iterations: ITERATIONS },
    );
  });
}

function validateCase(
  label: string,
  factory: () => BenchCase,
  check: (step: number, instance: BenchCase) => void,
  steps = 5,
): void {
  const instance = factory();
  try {
    for (let i = 0; i < steps; i++) {
      instance.step();
      check(i, instance);
    }
    console.log(`  ✓ ${label}`);
  } catch (error) {
    console.error(`  ✗ ${label}:`, error);
    throw error;
  } finally {
    instance.dispose();
  }
}

function createReflexFlatCase(): FlatCase {
  createRuntime({ effectStrategy: "flush" });
  const [count, setCount] = signal(0);
  const store = createReflexStoreProjection(
    (draft: { count: number; doubled: number }) => {
      const value = count();
      draft.count = value;
      draft.doubled = value * 2;
    },
    { count: 0, doubled: 0 },
  );
  const stopA = effect(() => { blackhole(store.count); });
  const stopB = effect(() => { blackhole(store.doubled); });

  return {
    step() {
      setCount((prev) => prev + 1);
      flush();
    },
    dispose() {
      stopB();
      stopA();
    },
    readCount: () => store.count,
    readDoubled: () => store.doubled,
  };
}

function createSolidFlatCase(): FlatCase {
  const { withOwner, dispose } = createSolidOwner();
  const [count, setCount] = withOwner(() => createSignal(0));
  const store = withOwner(() =>
    createSolidProjection<{ count: number; doubled: number }>((draft) => {
      const value = count();
      draft.count = value;
      draft.doubled = value * 2;
    }, { count: 0, doubled: 0 }),
  );
  withOwner(() => createEffect(() => store.count, (value) => { blackhole(value); }));
  withOwner(() => createEffect(() => store.doubled, (value) => { blackhole(value); }));

  return {
    step() {
      setCount((prev) => prev + 1);
      solidflush();
    },
    dispose,
    readCount: () => store.count,
    readDoubled: () => store.doubled,
  };
}

function createReflexNestedCase(): NestedCase {
  createRuntime({ effectStrategy: "flush" });
  const [first, setFirst] = signal("Ada");
  const [last, setLast] = signal("Lovelace");
  const names = [
    ["Ada", "Lovelace"],
    ["Grace", "Hopper"],
    ["Barbara", "Liskov"],
    ["Edsger", "Dijkstra"],
  ] as const;
  let cursor = 0;
  const store = createReflexStoreProjection(
    (draft: { user: { fullName: string; initials: string } }) => {
      const currentFirst = first();
      const currentLast = last();
      draft.user = {
        fullName: `${currentFirst} ${currentLast}`,
        initials: `${currentFirst[0]}${currentLast[0]}`,
      };
    },
    { user: { fullName: "", initials: "" } },
  );
  const stopA = effect(() => { blackhole(store.user.fullName); });
  const stopB = effect(() => { blackhole(store.user.initials); });

  return {
    step() {
      cursor = (cursor + 1) % names.length;
      const [nextFirst, nextLast] = names[cursor]!;
      setFirst(nextFirst);
      setLast(nextLast);
      flush();
    },
    dispose() {
      stopB();
      stopA();
    },
    readFullName: () => store.user.fullName,
    readInitials: () => store.user.initials,
  };
}

function createSolidNestedCase(): NestedCase {
  const { withOwner, dispose } = createSolidOwner();
  const [first, setFirst] = withOwner(() => createSignal("Ada"));
  const [last, setLast] = withOwner(() => createSignal("Lovelace"));
  const names = [
    ["Ada", "Lovelace"],
    ["Grace", "Hopper"],
    ["Barbara", "Liskov"],
    ["Edsger", "Dijkstra"],
  ] as const;
  let cursor = 0;
  const store = withOwner(() =>
    createSolidProjection<{ user: { fullName: string; initials: string } }>(
      (draft) => {
        const currentFirst = first();
        const currentLast = last();
        draft.user = {
          fullName: `${currentFirst} ${currentLast}`,
          initials: `${currentFirst[0]}${currentLast[0]}`,
        };
      },
      { user: { fullName: "", initials: "" } },
    ),
  );
  withOwner(() => createEffect(() => store.user.fullName, (value) => { blackhole(value); }));
  withOwner(() => createEffect(() => store.user.initials, (value) => { blackhole(value); }));

  return {
    step() {
      cursor = (cursor + 1) % names.length;
      const [nextFirst, nextLast] = names[cursor]!;
      setFirst(nextFirst);
      setLast(nextLast);
      solidflush();
    },
    dispose,
    readFullName: () => store.user.fullName,
    readInitials: () => store.user.initials,
  };
}

function createReflexRecordCase(rows = MEDIUM, width = 10): RecordCase {
  createRuntime({ effectStrategy: "flush" });
  const nextPayload = createPreparedRecordPayloadFactory(rows, width);
  const [payload, setPayload] = signal<PreparedBatchPayload>(
    createEmptyPreparedPayload(width),
  );
  const store = createReflexStoreProjection<Record<number, string | undefined>>(
    (draft) => {
      const current = payload();
      for (let i = 0; i < width; i++) {
        const previousId = current.previousIds[i];
        if (previousId !== -1) delete draft[previousId];
      }
      for (let i = 0; i < width; i++) {
        draft[current.ids[i]] = current.labels[i];
      }
    },
    {},
  );
  const disposers = Array.from({ length: rows }, (_, id) =>
    effect(() => { blackhole(store[id]); }),
  );

  return {
    step() {
      setPayload(nextPayload());
      flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; i--) {
        disposers[i]!();
      }
    },
    readLabel: (id) => store[id],
  };
}

function createSolidRecordCase(rows = MEDIUM, width = 10): RecordCase {
  const { withOwner, dispose } = createSolidOwner();
  const nextPayload = createPreparedRecordPayloadFactory(rows, width);
  const [payload, setPayload] = withOwner(() =>
    createSignal<PreparedBatchPayload>(createEmptyPreparedPayload(width)),
  );
  const store = withOwner(() =>
    createSolidProjection<Record<number, string | undefined>>((draft) => {
      const current = payload();
      for (let i = 0; i < width; i++) {
        const previousId = current.previousIds[i];
        if (previousId !== -1) delete draft[previousId];
      }
      for (let i = 0; i < width; i++) {
        draft[current.ids[i]] = current.labels[i];
      }
    }, {}),
  );
  for (let id = 0; id < rows; id++) {
    const key = id;
    withOwner(() => createEffect(() => store[key], (value) => { blackhole(value); }));
  }
  return {
    step() {
      setPayload(nextPayload());
      solidflush();
    },
    dispose,
    readLabel: (id) => store[id],
  };
}

function createRecordPayloadBaselineCase(rows = MEDIUM, width = 10): BaselineCase {
  const nextPayload = createPreparedRecordPayloadFactory(rows, width);
  let current = createEmptyPreparedPayload(width);

  return {
    step() {
      current = nextPayload();
      blackhole(current);
    },
    dispose() {},
    readPayload: () => current,
  };
}

console.log("\n=== Store Projection Benchmark Validation ===");

validateCase("S1 reflex flat store projection", () => createReflexFlatCase(), (step, instance) => {
  const current = step + 1;
  const currentCase = instance as FlatCase;
  assert(currentCase.readCount() === current, `count expected ${current}`);
  assert(currentCase.readDoubled() === current * 2, `doubled expected ${current * 2}`);
});

validateCase("S1 solid flat store projection", () => createSolidFlatCase(), (step, instance) => {
  const current = step + 1;
  const currentCase = instance as FlatCase;
  assert(currentCase.readCount() === current, `count expected ${current}`);
  assert(currentCase.readDoubled() === current * 2, `doubled expected ${current * 2}`);
});

validateCase("S2 reflex nested store projection", () => createReflexNestedCase(), (_step, instance) => {
  const currentCase = instance as NestedCase;
  const fullName = currentCase.readFullName();
  const initials = currentCase.readInitials();
  const [first, last] = fullName.split(" ");
  assert(initials === `${first[0]}${last[0]}`, `initials mismatch for "${fullName}"`);
});

validateCase("S2 solid nested store projection", () => createSolidNestedCase(), (_step, instance) => {
  const currentCase = instance as NestedCase;
  const fullName = currentCase.readFullName();
  const initials = currentCase.readInitials();
  const [first, last] = fullName.split(" ");
  assert(initials === `${first[0]}${last[0]}`, `initials mismatch for "${fullName}"`);
});

validateCase("S3 reflex record store projection", () => createReflexRecordCase(20, 4), (step, instance) => {
  const currentCase = instance as RecordCase;
  for (let i = 0; i < 4; i++) {
    const id = (step + i) % 20;
    assert(
      currentCase.readLabel(id) === `label-${id}-v${step}`,
      `id ${id} expected label-${id}-v${step}, got ${currentCase.readLabel(id)}`,
    );
  }
});

validateCase("S3 solid record store projection", () => createSolidRecordCase(20, 4), (step, instance) => {
  const currentCase = instance as RecordCase;
  for (let i = 0; i < 4; i++) {
    const id = (step + i) % 20;
    assert(
      currentCase.readLabel(id) === `label-${id}-v${step}`,
      `id ${id} expected label-${id}-v${step}, got ${currentCase.readLabel(id)}`,
    );
  }
});

validateCase("S3 payload baseline", () => createRecordPayloadBaselineCase(20, 4), (step, instance) => {
  const currentCase = instance as BaselineCase;
  const payload = currentCase.readPayload();
  for (let i = 0; i < 4; i++) {
    const id = (step + i) % 20;
    assert(payload.ids[i] === id, `payload id ${i} expected ${id}, got ${payload.ids[i]}`);
    assert(
      payload.labels[i] === `label-${id}-v${step}`,
      `payload label ${i} expected label-${id}-v${step}, got ${payload.labels[i]}`,
    );
  }
});

console.log("=== Store Projection Validation complete ===\n");

registerCase("S1 reflex | flat store projection | scalar derive", () => createReflexFlatCase());
registerCase("S1 solid  | flat store projection | scalar derive", () => createSolidFlatCase());

registerCase("S2 reflex | nested store projection | name card", () => createReflexNestedCase());
registerCase("S2 solid  | nested store projection | name card", () => createSolidNestedCase());

registerCase("S3 reflex | record store projection | 1k rows", () => createReflexRecordCase(MEDIUM, 10));
registerCase("S3 solid  | record store projection | 1k rows", () => createSolidRecordCase(MEDIUM, 10));
registerCase("S3 reflex | record store projection | 100 rows", () => createReflexRecordCase(SMALL, 10));
registerCase("S3 solid  | record store projection | 100 rows", () => createSolidRecordCase(SMALL, 10));
registerCase("S3 baseline | payload generation | 1k rows", () => createRecordPayloadBaselineCase(MEDIUM, 10));
registerCase("S3 baseline | payload generation | 100 rows", () => createRecordPayloadBaselineCase(SMALL, 10));
