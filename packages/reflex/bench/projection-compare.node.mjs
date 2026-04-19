import { createRuntime, effect, signal } from "../dist/esm/index.js";
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
} = SolidSignalsModule;

const ROWS = 1_000;
const WARMUP_STEPS = 10_000;
const MEASURE_STEPS = 50_000;

function blackhole(value) {
  void value;
}

function formatHz(hz) {
  return hz.toFixed(2);
}

function formatMs(ms) {
  return ms.toFixed(3);
}

function runSelectionReflex(steps) {
  const runtime = createRuntime({ effectStrategy: "ranked" });
  const [selected, setSelected] = signal(undefined);
  const selectedMap = createReflexProjection(
    selected,
    (value) => value,
    (value) => value !== undefined,
    { fallback: false, priority: 100 },
  );

  const disposers = Array.from({ length: ROWS }, (_, index) =>
    effect(() => {
      blackhole(selectedMap(index));
    }),
  );

  runtime.flush();

  let next = 0;
  const startedAt = performance.now();
  for (let step = 0; step < steps; ++step) {
    next = (next + 1) % ROWS;
    setSelected(next);
    runtime.flush();
  }
  const wallTimeMs = performance.now() - startedAt;

  for (let i = disposers.length - 1; i >= 0; --i) {
    disposers[i]();
  }

  return wallTimeMs;
}

function runSelectionSolid(steps) {
  let owner;
  let disposeRoot = () => {};

  createRoot((dispose) => {
    disposeRoot = dispose;
    owner = getOwner();
    return undefined;
  });

  const withOwner = (fn) => runWithOwner(owner, fn);
  const [selected, setSelected] = withOwner(() => createSignal(undefined));
  let previous;

  const selectedMap = withOwner(() =>
    createSolidProjection((draft) => {
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
        () => selectedMap[index],
        (value) => {
          blackhole(value);
        },
      ),
    );
  }

  solidFlush();

  let next = 0;
  const startedAt = performance.now();
  for (let step = 0; step < steps; ++step) {
    next = (next + 1) % ROWS;
    setSelected(next);
    solidFlush();
  }
  const wallTimeMs = performance.now() - startedAt;

  disposeRoot();
  return wallTimeMs;
}

function runEntityReflex(steps) {
  const runtime = createRuntime({ effectStrategy: "ranked" });
  const [entity, setEntity] = signal({ id: 0, label: "label-0" });
  const labels = createReflexProjection(
    entity,
    (value) => value.id,
    (value) => value.label,
    { fallback: undefined, priority: 100 },
  );

  const disposers = Array.from({ length: ROWS }, (_, index) =>
    effect(() => {
      blackhole(labels(index));
    }),
  );

  runtime.flush();

  let next = 0;
  const startedAt = performance.now();
  for (let step = 0; step < steps; ++step) {
    next = (next + 1) % ROWS;
    setEntity({ id: next, label: `label-${next}` });
    runtime.flush();
  }
  const wallTimeMs = performance.now() - startedAt;

  for (let i = disposers.length - 1; i >= 0; --i) {
    disposers[i]();
  }

  return wallTimeMs;
}

function runEntitySolid(steps) {
  let owner;
  let disposeRoot = () => {};

  createRoot((dispose) => {
    disposeRoot = dispose;
    owner = getOwner();
    return undefined;
  });

  const withOwner = (fn) => runWithOwner(owner, fn);
  const [entity, setEntity] = withOwner(() =>
    createSignal({ id: 0, label: "label-0" }),
  );
  let previous;

  const labels = withOwner(() =>
    createSolidProjection((draft) => {
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
        () => labels[index],
        (value) => {
          blackhole(value);
        },
      ),
    );
  }

  solidFlush();

  let next = 0;
  const startedAt = performance.now();
  for (let step = 0; step < steps; ++step) {
    next = (next + 1) % ROWS;
    setEntity({ id: next, label: `label-${next}` });
    solidFlush();
  }
  const wallTimeMs = performance.now() - startedAt;

  disposeRoot();
  return wallTimeMs;
}

function runCase(label, runReflex, runSolid) {
  runReflex(WARMUP_STEPS);
  runSolid(WARMUP_STEPS);

  const reflexMs = runReflex(MEASURE_STEPS);
  const solidMs = runSolid(MEASURE_STEPS);
  const reflexHz = (MEASURE_STEPS * 1000) / reflexMs;
  const solidHz = (MEASURE_STEPS * 1000) / solidMs;

  console.log(`\n[projection-compare] ${label}`);
  console.table([
    {
      library: "reflex",
      steps: MEASURE_STEPS,
      "time ms": formatMs(reflexMs),
      hz: formatHz(reflexHz),
      "vs solid": `${(reflexHz / solidHz).toFixed(2)}x`,
    },
    {
      library: "solid",
      steps: MEASURE_STEPS,
      "time ms": formatMs(solidMs),
      hz: formatHz(solidHz),
      "vs solid": "1.00x",
    },
  ]);
}

runCase(
  "selection dictionary",
  runSelectionReflex,
  runSelectionSolid,
);

runCase(
  "active entity label",
  runEntityReflex,
  runEntitySolid,
);
