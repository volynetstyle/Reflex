import { bench, describe } from "vitest";
import { createRuntime, memo, signal } from "../dist/esm/index";

type Read<T> = () => T;
type Write<T> = (value: T) => T;
type SignalPair<T> = readonly [Read<T>, Write<T>];

const PLAN_STEPS = 128;

let sinkAcc = 0;

const bh = (value: number) => {
  sinkAcc = (sinkAcc * 100_019 + (value | 0)) | 0;
};

function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`Missing item at index ${index}`);
  }
  return value;
}

function createRng(seed: number) {
  let state = seed | 0;

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(maxExclusive: number) {
      return Math.floor(next() * maxExclusive);
    },
    float(range: number, offset = 0) {
      return offset + next() * range;
    },
  };
}

function createHarness() {
  createRuntime();

  return {
    signal<T>(initialValue: T): SignalPair<T> {
      return signal(initialValue);
    },
    memo<T>(fn: () => T): Read<T> {
      return memo(fn);
    },
  };
}

function createIntSequence(
  length: number,
  seed: number,
  maxExclusive: number,
): Uint16Array {
  const rng = createRng(seed);
  const values = new Uint16Array(length);

  for (let index = 0; index < length; index++) {
    values[index] = rng.int(maxExclusive);
  }

  return values;
}

function createFloatSequence(
  length: number,
  seed: number,
  range: number,
  offset = 0,
): Float64Array {
  const rng = createRng(seed);
  const values = new Float64Array(length);

  for (let index = 0; index < length; index++) {
    values[index] = rng.float(range, offset);
  }

  return values;
}

function createFloatBatches(
  length: number,
  batchSize: number,
  seed: number,
  range: number,
  offset = 0,
): readonly Float64Array[] {
  const rng = createRng(seed);
  const batches: Float64Array[] = new Array(length);

  for (let batchIndex = 0; batchIndex < length; batchIndex++) {
    const values = new Float64Array(batchSize);

    for (let valueIndex = 0; valueIndex < batchSize; valueIndex++) {
      values[valueIndex] = rng.float(range, offset);
    }

    batches[batchIndex] = values;
  }

  return batches;
}

function createUniqueIndexBatches(
  length: number,
  maxExclusive: number,
  batchSize: number,
  seed: number,
): readonly Uint16Array[] {
  const rng = createRng(seed);
  const batches: Uint16Array[] = new Array(length);
  const marks = new Uint32Array(maxExclusive);
  let epoch = 0;

  for (let batchIndex = 0; batchIndex < length; batchIndex++) {
    if (++epoch === 0) {
      marks.fill(0);
      epoch = 1;
    }

    const indices = new Uint16Array(batchSize);
    let filled = 0;

    while (filled < batchSize) {
      const nextIndex = rng.int(maxExclusive);

      if (marks[nextIndex] === epoch) {
        continue;
      }

      marks[nextIndex] = epoch;
      indices[filled++] = nextIndex;
    }

    batches[batchIndex] = indices;
  }

  return batches;
}

// Each benchmark run replays several precomputed steps so tinybench measures
// reactive work instead of RNG, unique sampling, and one-call timer noise.
function createBenchRunner(
  stepCount: number,
  opsPerIteration: number,
  runStep: (stepIndex: number) => void,
): () => void {
  let cursor = 0;

  return () => {
    for (let op = 0; op < opsPerIteration; op++) {
      runStep(cursor);
      cursor = cursor + 1 === stepCount ? 0 : cursor + 1;
    }
  };
}

function primeReads(reads: readonly Read<number>[]) {
  for (const read of reads) {
    bh(read());
  }
}

function readEvery(reads: readonly Read<number>[], step: number) {
  for (let index = 0; index < reads.length; index += step) {
    bh(at(reads, index)());
  }
}

function readAll(reads: readonly Read<number>[]) {
  for (const read of reads) {
    bh(read());
  }
}

describe("Wide static graph (1000 memos x 5 deps)", () => {
  const MEMOS = 1000;
  const DEPS = 5;

  function buildWideGraph(sourceCount: number) {
    const ours = createHarness();
    const sources = Array.from({ length: sourceCount }, (_, index) =>
      ours.signal(index),
    );
    const memos = Array.from({ length: MEMOS }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;

        for (let depIndex = 0; depIndex < DEPS; depIndex++) {
          sum += at(sources, (memoIndex + depIndex * 3) % sourceCount)[0]();
        }

        return sum;
      }),
    );

    primeReads(memos);

    return { sources, memos };
  }

  const g2 = buildWideGraph(2);
  const g25 = buildWideGraph(25);

  const g2SourceIndices = createIntSequence(PLAN_STEPS, 0x201, 2);
  const g2Values = createFloatSequence(PLAN_STEPS, 0x202, 1000);
  const g25SourceIndices = createIntSequence(PLAN_STEPS, 0x251, 25);
  const g25Values = createFloatSequence(PLAN_STEPS, 0x252, 1000);

  bench(
    "ours - 2 sources, change 1, read ~10%",
    createBenchRunner(PLAN_STEPS, 12, (stepIndex) => {
      at(g2.sources, g2SourceIndices[stepIndex])[1](g2Values[stepIndex]);
      readEvery(g2.memos, 10);
    }),
    { iterations: 40, warmupIterations: 10 },
  );

  bench(
    "ours - 25 sources, change 1, read ~10%",
    createBenchRunner(PLAN_STEPS, 10, (stepIndex) => {
      at(g25.sources, g25SourceIndices[stepIndex])[1](g25Values[stepIndex]);
      readEvery(g25.memos, 9);
    }),
    { iterations: 35, warmupIterations: 10 },
  );
});

describe("Deep chains (8 x 400 depth)", () => {
  const SOURCE_COUNT = 4;
  const CHAIN_COUNT = 8;
  const DEPTH = 400;

  function buildDeepChains() {
    const ours = createHarness();
    const sources = Array.from({ length: SOURCE_COUNT }, () => ours.signal(0));
    const ends: Read<number>[] = [];

    for (let chainIndex = 0; chainIndex < CHAIN_COUNT; chainIndex++) {
      let prev = at(sources, chainIndex % SOURCE_COUNT)[0];

      for (let depthIndex = 0; depthIndex < DEPTH; depthIndex++) {
        const previous = prev;
        prev = ours.memo(() => previous());
      }

      ends.push(prev);
    }

    primeReads(ends);

    return { sources, ends };
  }

  const g = buildDeepChains();
  const sourceValues = createFloatSequence(PLAN_STEPS, 0x401, 200);

  bench(
    "ours - change 1 source, read 8 ends",
    createBenchRunner(PLAN_STEPS, 24, (stepIndex) => {
      at(g.sources, 1)[1](sourceValues[stepIndex]);
      readAll(g.ends);
    }),
    { iterations: 45, warmupIterations: 10 },
  );
});

describe("Diamond / fan-out -> fan-in (200 paths x 5 depth)", () => {
  const PATHS = 200;
  const DEPTH = 5;

  function buildDiamond() {
    const ours = createHarness();
    const sources = Array.from({ length: PATHS }, () => ours.signal(0));
    const pathEnds = sources.map(([source]) => {
      let prev: Read<number> = source;

      for (let depthIndex = 0; depthIndex < DEPTH; depthIndex++) {
        const previous = prev;
        prev = ours.memo(() => previous() * 1.0001 + depthIndex);
      }

      return prev;
    });
    const final = ours.memo(() => {
      let sum = 0;

      for (const read of pathEnds) {
        sum += read();
      }

      return sum;
    });

    bh(final());

    return { sources, final };
  }

  const g = buildDiamond();
  const sourceIndices = createIntSequence(PLAN_STEPS, 0x501, PATHS);
  const values = createFloatSequence(PLAN_STEPS, 0x502, 100);

  bench(
    "ours - change 1, read final",
    createBenchRunner(PLAN_STEPS, 24, (stepIndex) => {
      at(g.sources, sourceIndices[stepIndex])[1](values[stepIndex]);
      bh(g.final());
    }),
    { iterations: 45, warmupIterations: 10 },
  );
});

describe("Dynamic deps + frequent flip", () => {
  const MEMOS = 150;
  const SRCS = 12;
  const DEPS = 12;

  function buildDynamic() {
    const ours = createHarness();
    const sources = Array.from({ length: SRCS }, () => ours.signal(0));
    const memos = Array.from({ length: MEMOS }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;
        const flip = at(sources, 0)[0]() % 3;

        for (let depIndex = 0; depIndex < DEPS; depIndex++) {
          sum += at(sources, (memoIndex + depIndex + flip * 7) % SRCS)[0]();
        }

        return sum;
      }),
    );

    primeReads(memos);

    return { sources, memos };
  }

  const g = buildDynamic();
  const flipValues = createIntSequence(PLAN_STEPS, 0x601, 1000);

  bench(
    "ours - flip deps, read 100%",
    createBenchRunner(PLAN_STEPS, 10, (stepIndex) => {
      at(g.sources, 0)[1](flipValues[stepIndex]);
      readAll(g.memos);
    }),
    { iterations: 30, warmupIterations: 10 },
  );
});

describe("Large batch write (20% sources) + full read", () => {
  const MEMOS = 800;
  const SRCS = 80;
  const BATCH = Math.floor(SRCS * 0.2);

  function buildBatch() {
    const ours = createHarness();
    const sources = Array.from({ length: SRCS }, () => ours.signal(0));
    const memos = Array.from({ length: MEMOS }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;

        for (let depIndex = 0; depIndex < 6; depIndex++) {
          sum += at(sources, (memoIndex + depIndex) % SRCS)[0]();
        }

        return sum;
      }),
    );

    primeReads(memos);

    return { sources, memos };
  }

  const g = buildBatch();
  const sourceBatches = createUniqueIndexBatches(PLAN_STEPS, SRCS, BATCH, 0x701);
  const valueBatches = createFloatBatches(PLAN_STEPS, BATCH, 0x702, 1000);

  bench(
    "ours - batch 20% sources, read all",
    createBenchRunner(PLAN_STEPS, 4, (stepIndex) => {
      const batchSources = at(sourceBatches, stepIndex);
      const batchValues = at(valueBatches, stepIndex);

      for (let index = 0; index < BATCH; index++) {
        at(g.sources, batchSources[index])[1](batchValues[index]);
      }

      readAll(g.memos);
    }),
    { iterations: 20, warmupIterations: 5 },
  );
});

describe("Virtualized table (4000 rows x 6 cols)", () => {
  const ROWS = 4000;
  const COLS = 6;
  const VISIBLE = 400;
  const CHANGED = Math.floor(ROWS * 0.02);
  const MAX_START = ROWS - VISIBLE + 1;

  function primeTable(
    cells: readonly (readonly Read<number>[])[],
    sums: readonly Read<number>[],
    step: number,
  ) {
    for (let pass = 0; pass < 4; pass++) {
      for (let rowIndex = 0; rowIndex < cells.length; rowIndex += step) {
        for (let colIndex = 0; colIndex < 4; colIndex++) {
          bh(at(at(cells, rowIndex), colIndex)());
        }

        bh(at(sums, rowIndex)());
      }
    }
  }

  function renderVisible(
    cells: readonly (readonly Read<number>[])[],
    sums: readonly Read<number>[],
    start: number,
  ) {
    for (let rowIndex = start; rowIndex < start + VISIBLE; rowIndex++) {
      bh(at(sums, rowIndex)());

      for (let colIndex = 0; colIndex < COLS; colIndex++) {
        bh(at(at(cells, rowIndex), colIndex)());
      }
    }
  }

  function buildTable() {
    const ours = createHarness();
    const rowSources = Array.from({ length: ROWS }, (_, rowIndex) =>
      Array.from({ length: COLS }, (_, colIndex) =>
        ours.signal(colIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0),
      ),
    );
    const cells = Array.from({ length: ROWS }, (_, rowIndex) =>
      Array.from({ length: COLS }, (_, colIndex) =>
        ours.memo(() => {
          const base = at(at(rowSources, rowIndex), 0)[0]();

          if (colIndex === 0) {
            return base;
          }

          return Math.round(
            base * (1 + colIndex * 0.1) +
              at(at(rowSources, rowIndex), colIndex)[0](),
          );
        }),
      ),
    );
    const rowSums = Array.from({ length: ROWS }, (_, rowIndex) =>
      ours.memo(() => {
        let sum = 0;

        for (let colIndex = 0; colIndex < COLS; colIndex++) {
          sum += at(at(cells, rowIndex), colIndex)();
        }

        return sum;
      }),
    );

    primeTable(cells, rowSums, 150);

    return { rowSources, cells, rowSums };
  }

  const gPartial = buildTable();
  const partialRows = createUniqueIndexBatches(
    PLAN_STEPS,
    ROWS,
    CHANGED,
    0x801,
  );
  const partialValues = createFloatBatches(PLAN_STEPS, CHANGED, 0x802, 900, 100);
  const partialStarts = createIntSequence(PLAN_STEPS, 0x803, MAX_START);

  bench(
    "ours - partial update ~2% rows, render 400 visible",
    createBenchRunner(PLAN_STEPS, 3, (stepIndex) => {
      const rows = at(partialRows, stepIndex);
      const values = at(partialValues, stepIndex);

      for (let index = 0; index < CHANGED; index++) {
        at(at(gPartial.rowSources, rows[index]), 0)[1](values[index]);
      }

      renderVisible(gPartial.cells, gPartial.rowSums, partialStarts[stepIndex]);
    }),
    { iterations: 15, warmupIterations: 5 },
  );

  const gCol2 = buildTable();
  const col2Values = createFloatSequence(PLAN_STEPS, 0x811, 100);
  const col2Starts = createIntSequence(PLAN_STEPS, 0x812, MAX_START);

  bench(
    "ours - live col-2 update all rows, render 400 visible",
    createBenchRunner(PLAN_STEPS, 2, (stepIndex) => {
      const nextValue = col2Values[stepIndex];

      for (let rowIndex = 0; rowIndex < ROWS; rowIndex++) {
        at(at(gCol2.rowSources, rowIndex), 2)[1](nextValue);
      }

      const start = col2Starts[stepIndex];

      for (let rowIndex = start; rowIndex < start + VISIBLE; rowIndex++) {
        bh(at(at(gCol2.cells, rowIndex), 2)());
        bh(at(gCol2.rowSums, rowIndex)());
      }
    }),
    { iterations: 12, warmupIterations: 5 },
  );
});

describe("UI: form with derived state (2-layer, 20 fields)", () => {
  const FIELDS = 20;

  function buildForm() {
    const ours = createHarness();
    const fields = Array.from({ length: FIELDS }, (_, index) =>
      ours.signal(index * 10),
    );
    const trimmed = fields.map(([read]) => ours.memo(() => read() % 1000));
    const valid = fields.map(([read], index) =>
      ours.memo(() => (read() > 0 && at(trimmed, index)() < 999 ? 1 : 0)),
    );
    const formatted = fields.map((_, index) =>
      ours.memo(() =>
        Math.round(at(trimmed, index)() * at(valid, index)()),
      ),
    );
    const formValid = ours.memo(() => {
      let sum = 0;

      for (const read of valid) {
        sum += read();
      }

      return sum;
    });

    primeReads(formatted);
    bh(formValid());

    return { fields, formatted, formValid };
  }

  const g = buildForm();
  const fieldIndices = createIntSequence(PLAN_STEPS, 0xa01, FIELDS);
  const fieldValues = createFloatSequence(PLAN_STEPS, 0xa02, 2000, -500);

  bench(
    "ours - edit 1 field, read all formatted + formValid",
    createBenchRunner(PLAN_STEPS, 24, (stepIndex) => {
      at(g.fields, fieldIndices[stepIndex])[1](fieldValues[stepIndex]);
      readAll(g.formatted);
      bh(g.formValid());
    }),
    { iterations: 45, warmupIterations: 10 },
  );
});

describe("UI: filtered + sorted list (3-layer, 500 items)", () => {
  const ITEMS = 500;
  const PAGE = 20;

  function buildList() {
    const ours = createHarness();
    const items = Array.from({ length: ITEMS }, (_, index) => ours.signal(index));
    const min = ours.signal(200);
    const page = ours.signal(0);
    const filtered = ours.memo(() =>
      items.map(([read]) => read()).filter((value) => value >= min[0]()),
    );
    const sorted = ours.memo(() => [...filtered()].sort((a, b) => a - b));
    const slice = ours.memo(() =>
      sorted().slice(page[0]() * PAGE, (page[0]() + 1) * PAGE),
    );
    const count = ours.memo(() => filtered().length);

    for (const value of slice()) {
      bh(value);
    }
    bh(count());

    return { items, min, slice, count };
  }

  const gItem = buildList();
  const itemIndices = createIntSequence(PLAN_STEPS, 0xb01, ITEMS);
  const itemValues = createFloatSequence(PLAN_STEPS, 0xb02, 1000, ITEMS);

  bench(
    "ours - update 1 item, read page + count",
    createBenchRunner(PLAN_STEPS, 24, (stepIndex) => {
      at(gItem.items, itemIndices[stepIndex])[1](itemValues[stepIndex]);

      for (const value of gItem.slice()) {
        bh(value);
      }

      bh(gItem.count());
    }),
    { iterations: 25, warmupIterations: 5 },
  );

  const gFilter = buildList();
  const thresholds = createIntSequence(PLAN_STEPS, 0xb11, ITEMS);

  bench(
    "ours - change filter threshold, read page + count",
    createBenchRunner(PLAN_STEPS, 24, (stepIndex) => {
      gFilter.min[1](thresholds[stepIndex]);

      for (const value of gFilter.slice()) {
        bh(value);
      }

      bh(gFilter.count());
    }),
    { iterations: 25, warmupIterations: 5 },
  );
});

describe("UI: component tree (3-layer props, 8 parents x 10 children)", () => {
  const PARENTS = 8;
  const CHILDREN = 10;

  function buildTree() {
    const ours = createHarness();
    const scale = ours.signal(1);
    const locale = ours.signal(1);
    const base = ours.signal(16);
    const parents = Array.from({ length: PARENTS }, (_, parentIndex) => ({
      fontSize: ours.memo(() => base[0]() * scale[0]() * (1 + parentIndex * 0.1)),
      spacing: ours.memo(() => scale[0]() * 8 * (1 + parentIndex * 0.05)),
      rtl: ours.memo(() => locale[0]() % 2),
    }));
    const children = parents.flatMap((parent) =>
      Array.from({ length: CHILDREN }, (_, childIndex) => ({
        display: ours.memo(() => parent.fontSize() * (1 + childIndex * 0.02)),
        margin: ours.memo(() => parent.spacing() * ((childIndex % 3) + 1)),
        dir: ours.memo(() => parent.rtl()),
        label: ours.memo(() => Math.round(parent.fontSize() * 10 + childIndex)),
      })),
    );

    return { scale, locale, children };
  }

  function readAllChildren(
    children: readonly {
      display: Read<number>;
      margin: Read<number>;
      dir: Read<number>;
      label: Read<number>;
    }[],
  ) {
    for (const child of children) {
      bh(child.display());
      bh(child.margin());
      bh(child.dir());
      bh(child.label());
    }
  }

  const gScale = buildTree();
  readAllChildren(gScale.children);
  const scaleValues = createFloatSequence(PLAN_STEPS, 0xc01, 0.4, 0.8);

  bench(
    "ours - global scale change, read all children",
    createBenchRunner(PLAN_STEPS, 16, (stepIndex) => {
      gScale.scale[1](scaleValues[stepIndex]);
      readAllChildren(gScale.children);
    }),
    { iterations: 35, warmupIterations: 10 },
  );

  const gLocale = buildTree();
  readAllChildren(gLocale.children);
  const localeValues = createIntSequence(PLAN_STEPS, 0xc11, 10);

  bench(
    "ours - locale change, read all children",
    createBenchRunner(PLAN_STEPS, 16, (stepIndex) => {
      gLocale.locale[1](localeValues[stepIndex]);
      readAllChildren(gLocale.children);
    }),
    { iterations: 35, warmupIterations: 10 },
  );
});
