import { afterAll, bench, describe } from "vitest";

import { createScopedRuntime } from "../dist/esm/index.js";
import { createProjection as createReflexProjection } from "../dist/esm/unstable/index.js";
import * as SolidSignalsModule from "../../@reflex/runtime/node_modules/@solidjs/signals/dist/prod.js";

const {
  createEffect,
  createProjection: createSolidProjection,
  createRoot,
  createSignal,
  flush: solidFlush,
  getOwner,
  runWithOwner,
} = SolidSignalsModule as {
  createEffect<T>(compute: () => T, effectFn: (value: T, prev?: T) => void): void;
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

const ROWS = 1_000;
const WARMUP_ITERATIONS = 150;
const ITERATIONS = 1_000;

function blackhole(value: unknown): void {
  void value;
}

interface BenchCase {
  step(): void;
  dispose(): void;
}

function createReflexSelectionCase(): BenchCase {
  const runtime = createScopedRuntime({ effectStrategy: "ranked" });
  const [selected, setSelected] = runtime.signal<number | undefined>(undefined);

  const projection = runtime.run(() =>
    createReflexProjection(
      selected,
      (value) => value,
      (value) => value !== undefined,
      { fallback: false, priority: 100 },
    ),
  );

  const disposers = Array.from({ length: ROWS }, (_, index) =>
    runtime.effect(() => {
      blackhole(projection(index));
    }),
  );

  let next = 0;

  return {
    step() {
      next = (next + 1) % ROWS;
      setSelected(next);
      runtime.flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; --i) {
        disposers[i]!();
      }
      runtime.dispose();
    },
  };
}

function createSolidSelectionCase(): BenchCase {
  let owner: unknown;
  let disposeRoot = () => {};

  createRoot((dispose) => {
    disposeRoot = dispose;
    owner = getOwner();
    return undefined;
  });

  if (owner === undefined) {
    throw new Error("Solid owner was not created for projection benchmark");
  }

  const withOwner = <T>(fn: () => T) => runWithOwner(owner, fn);

  const [selected, setSelected] = withOwner(() => createSignal<number | undefined>(undefined));
  let previous: number | undefined;

  const projection = withOwner(() =>
    createSolidProjection<Record<number, boolean>>((draft) => {
      const current = selected();
      if (previous !== undefined && previous !== current) {
        delete draft[previous];
      }
      if (current !== undefined) {
        draft[current] = true;
      }
      previous = current;
    }, {}),
  );

  for (let index = 0; index < ROWS; ++index) {
    withOwner(() =>
      createEffect(
        () => projection[index],
        (value) => {
          blackhole(value);
        },
      ),
    );
  }

  let next = 0;

  return {
    step() {
      next = (next + 1) % ROWS;
      setSelected(next);
      solidFlush();
    },
    dispose() {
      disposeRoot();
    },
  };
}

function createReflexEntityProjectionCase(): BenchCase {
  const runtime = createScopedRuntime({ effectStrategy: "ranked" });
  const [entity, setEntity] = runtime.signal({ id: 0, label: "label-0" });

  const labels = runtime.run(() =>
    createReflexProjection(
      entity,
      (value) => value.id,
      (value) => value.label,
      { fallback: undefined, priority: 100 },
    ),
  );

  const disposers = Array.from({ length: ROWS }, (_, index) =>
    runtime.effect(() => {
      blackhole(labels(index));
    }),
  );

  let next = 0;

  return {
    step() {
      next = (next + 1) % ROWS;
      setEntity({ id: next, label: `label-${next}` });
      runtime.flush();
    },
    dispose() {
      for (let i = disposers.length - 1; i >= 0; --i) {
        disposers[i]!();
      }
      runtime.dispose();
    },
  };
}

function createSolidEntityProjectionCase(): BenchCase {
  let owner: unknown;
  let disposeRoot = () => {};

  createRoot((dispose) => {
    disposeRoot = dispose;
    owner = getOwner();
    return undefined;
  });

  if (owner === undefined) {
    throw new Error("Solid owner was not created for projection benchmark");
  }

  const withOwner = <T>(fn: () => T) => runWithOwner(owner, fn);

  const [entity, setEntity] = withOwner(() =>
    createSignal({ id: 0, label: "label-0" }),
  );
  let previous: number | undefined;

  const projection = withOwner(() =>
    createSolidProjection<Record<number, string | undefined>>((draft) => {
      const current = entity();
      if (previous !== undefined && previous !== current.id) {
        delete draft[previous];
      }
      draft[current.id] = current.label;
      previous = current.id;
    }, {}),
  );

  for (let index = 0; index < ROWS; ++index) {
    withOwner(() =>
      createEffect(
        () => projection[index],
        (value) => {
          blackhole(value);
        },
      ),
    );
  }

  let next = 0;

  return {
    step() {
      next = (next + 1) % ROWS;
      setEntity({ id: next, label: `label-${next}` });
      solidFlush();
    },
    dispose() {
      disposeRoot();
    },
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
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
      },
    );
  });
}

registerCase("reflex projection: selection dictionary", createReflexSelectionCase);
registerCase("solid projection: selection dictionary", createSolidSelectionCase);
registerCase("reflex projection: active entity label", createReflexEntityProjectionCase);
registerCase("solid projection: active entity label", createSolidEntityProjectionCase);
