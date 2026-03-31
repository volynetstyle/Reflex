import { bench, describe } from "vitest";
import { createRuntime, signal, memo } from "../dist/esm/index";

// ─── Types ───────────────────────────────────────────────────────────────────

type Read<T> = () => T;
type Write<T> = (value: T) => void;
type OursPair<T> = readonly [Read<T>, Write<T>, ReturnType<typeof signal<T>>];

// ─── Blackhole sink ───────────────────────────────────────────────────────────

let sinkAcc = 0;
const bh = (v: number) => {
  sinkAcc = (sinkAcc * 100_019 + (v | 0)) | 0;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Missing item at index ${i}`);
  return v;
}

function createRng(seed: number) {
  let s = seed | 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int: (n: number) => 0 as number,
    centered: (n: number) => 0 as number,
  };
}

function rng(seed: number) {
  const r = createRng(seed);
  const next = r.next.bind(r);
  return {
    next,
    int(n: number) {
      return Math.floor(next() * n);
    },
    centered(n: number) {
      return next() * n * 2 - n;
    },
  };
}

function primeReads(reads: readonly Read<number>[]) {
  for (const r of reads) bh(r());
}

function createUniqueIndexSampler(max: number) {
  const marks = new Uint32Array(max);
  let epoch = 0;
  return (count: number, r: ReturnType<typeof rng>, out: number[]) => {
    if (++epoch === 0) {
      marks.fill(0);
      epoch = 1;
    }
    out.length = 0;
    while (out.length < count) {
      const i = r.int(max);
      if (marks[i] === epoch) continue;
      marks[i] = epoch;
      out.push(i);
    }
    return out as readonly number[];
  };
}

// ─── Harness ──────────────────────────────────────────────────────────────────

function oursHarness() {
  const rt = createRuntime();
  return {
    signal<T>(v: T): OursPair<T> {
      const s = signal(v);
      return s as any;
    },
    memo<T>(fn: () => T): Read<T> {
      const m = memo(fn);
      return () => m();
    },
  };
}

// ─── Suite 1: Wide static graph ───────────────────────────────────────────────

describe("Wide static graph (1000 memos × 5 deps)", () => {
  const MEMOS = 1000,
    DEPS = 5;

  function buildWideGraph(
    memoCount: number,
    depCount: number,
    sourceCount: number,
  ) {
    const ours = oursHarness();
    const oursSrc = Array.from({ length: sourceCount }, (_, i) =>
      ours.signal(i),
    );
    const makeOursMemo = (mi: number) =>
      ours.memo(() => {
        let s = 0;
        for (let d = 0; d < depCount; d++)
          s += at(oursSrc, (mi + d * 3) % sourceCount)[0]();
        return s;
      });
    const oursMemos = Array.from({ length: memoCount }, (_, i) =>
      makeOursMemo(i),
    );
    for (const [, w] of oursSrc) w(0);
    primeReads(oursMemos);
    return { oursSrc, oursMemos, ours };
  }

  const g2 = buildWideGraph(MEMOS, DEPS, 2);
  const g25 = buildWideGraph(MEMOS, DEPS, 25);

  const r = {
    ours2: rng(0x201),
    ours25: rng(0x251),
  };

  function runWide(
    sources: readonly (readonly [Read<number>, Write<number>])[],
    memos: readonly Read<number>[],
    r: ReturnType<typeof rng>,
    readEvery: number,
  ) {
    at(sources, r.int(sources.length))[1](r.next() * 1000);
    for (let i = 0; i < memos.length; i += readEvery) bh(at(memos, i)());
  }

  bench(
    "ours - 2 sources, change 1, read ~10%",
    () => runWide(g2.oursSrc, g2.oursMemos, r.ours2, 10),
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "ours - 25 sources, change 1, read ~10%",
    () => runWide(g25.oursSrc, g25.oursMemos, r.ours25, 9),
    { iterations: 120, warmupIterations: 25 },
  );
});

// ─── Suite 2: Deep chains ─────────────────────────────────────────────────────

describe("Deep chains (8 × 400 depth)", () => {
  function buildDeepChains(
    sourceCount: number,
    chainCount: number,
    depth: number,
  ) {
    const ours = oursHarness();
    const oursSrc = Array.from({ length: sourceCount }, () => ours.signal(0));

    function buildChain<T>(
      count: number,
      getBase: (i: number) => Read<T>,
      makeMemo: (fn: () => T) => Read<T>,
    ) {
      const ends: Read<T>[] = [];
      for (let c = 0; c < count; c++) {
        let prev = getBase(c % sourceCount);
        for (let l = 0; l < depth; l++) {
          const p = prev;
          prev = makeMemo(() => p());
        }
        ends.push(prev);
      }
      return ends;
    }

    const oursEnds = buildChain(
      chainCount,
      (i) => oursSrc[i]![0],
      (fn) => ours.memo(fn),
    );

    for (const [, w] of oursSrc) w(0);
    primeReads(oursEnds);

    return { oursSrc, oursEnds };
  }

  const g = buildDeepChains(4, 8, 400);
  const rO = rng(0x401);

  bench(
    "ours - change 1 source, read 8 ends",
    () => {
      at(g.oursSrc, 1)[1](rO.next() * 200);
      for (const r of g.oursEnds) bh(r());
    },
    { iterations: 400, warmupIterations: 50 },
  );
});

// ─── Suite 3: Diamond fan-out → fan-in ────────────────────────────────────────

describe("Diamond / fan-out→fan-in (200 paths × 5 depth)", () => {
  const PATHS = 200,
    DEPTH = 5;

  function buildDiamond() {
    const ours = oursHarness();

    const sources = Array.from({ length: PATHS }, () => ours.signal(0));
    const pathEnds = sources.map(([src]) => {
      let prev: Read<number> = src;
      for (let l = 0; l < DEPTH; l++) {
        const p = prev;
        prev = ours.memo(() => p() * 1.0001 + l);
      }
      return prev;
    });
    const final = ours.memo(() => {
      let s = 0;
      for (const r of pathEnds) s += r();
      return s;
    });
    for (const [, w] of sources) w(0);
    bh(final());

    return { sources, final };
  }

  const g = buildDiamond();
  const rO = rng(0x501);

  bench(
    "ours - change 1, read final",
    () => {
      at(g.sources, rO.int(PATHS))[1](rO.next() * 100);
      bh(g.final());
    },
    { iterations: 800, warmupIterations: 100 },
  );
});

// ─── Suite 4: Dynamic deps ────────────────────────────────────────────────────

describe("Dynamic deps + frequent flip", () => {
  const MEMOS = 150,
    SRCS = 12,
    DEPS = 12;

  function buildDynamic() {
    const ours = oursHarness();
    const sources = Array.from({ length: SRCS }, () => ours.signal(0));
    const memos = Array.from({ length: MEMOS }, (_, mi) =>
      ours.memo(() => {
        let s = 0;
        const flip = at(sources, 0)[0]() % 3;
        for (let d = 0; d < DEPS; d++)
          s += at(sources, (mi + d + flip * 7) % SRCS)[0]();
        return s;
      }),
    );
    for (const [, w] of sources) w(0);
    primeReads(memos);
    return { sources, memos, ours };
  }

  const g = buildDynamic();
  const rO = rng(0x601);

  bench(
    "ours - flip deps, read 100%",
    () => {
      at(g.sources, 0)[1](rO.int(1000));
      for (const r of g.memos) bh(r());
    },
    { iterations: 300, warmupIterations: 50 },
  );
});

// ─── Suite 5: Large batch write ───────────────────────────────────────────────

describe("Large batch write (20% sources) + full read", () => {
  const MEMOS = 800,
    SRCS = 80,
    BATCH = Math.floor(SRCS * 0.2);

  function buildBatch() {
    const ours = oursHarness();
    const oursSrc = Array.from({ length: SRCS }, () => ours.signal(0));
    const makeOursMemo = (mi: number) =>
      ours.memo(() => {
        let s = 0;
        for (let d = 0; d < 6; d++) s += at(oursSrc, (mi + d) % SRCS)[0]();
        return s;
      });
    const oursMemos = Array.from({ length: MEMOS }, (_, i) => makeOursMemo(i));
    for (const [, w] of oursSrc) w(0);
    primeReads(oursMemos);

    const batchWrites = Array.from(
      { length: BATCH },
      (_, i) => [oursSrc[i]![2], 0] as [any, any],
    );

    return { oursSrc, oursMemos, batchWrites, ours };
  }

  const g = buildBatch();
  const rO = rng(0x701);

  bench(
    "ours - batch 20% sources, read all",
    () => {
      for (let i = 0; i < g.batchWrites.length; i++)
        g.batchWrites[i]![1] = rO.next() * 100;

      for (const r of g.oursMemos) bh(r());
    },
    { iterations: 180, warmupIterations: 40 },
  );
});

// ─── Suite 6: Virtualized table ───────────────────────────────────────────────

describe("Virtualized table (4000 rows × 6 cols)", () => {
  const ROWS = 4000,
    COLS = 6,
    VISIBLE = 400;
  const CHANGED = Math.floor(ROWS * 0.02);

  function primeTable(
    cells: readonly (readonly Read<number>[])[],
    sums: readonly Read<number>[],
    step: number,
  ) {
    for (let p = 0; p < 4; p++)
      for (let r = 0; r < cells.length; r += step) {
        for (let c = 0; c < 4; c++) bh(cells[r]![c]!());
        bh(sums[r]!());
      }
  }

  function renderVisible(
    cells: readonly (readonly Read<number>[])[],
    sums: readonly Read<number>[],
    start: number,
  ) {
    for (let r = start; r < start + VISIBLE; r++) {
      bh(sums[r]!());
      for (let c = 0; c < COLS; c++) bh(cells[r]![c]!());
    }
  }

  function buildTable() {
    const ours = oursHarness();

    const rowSources = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, (_, c) => ours.signal(c === 0 ? 100 : 0)),
    );
    const cells = Array.from({ length: ROWS }, (_, ri) =>
      Array.from({ length: COLS }, (_, ci) =>
        ours.memo(() => {
          const base = rowSources[ri]![0]![0]();
          if (ci === 0) return base;
          return Math.round(base * (1 + ci * 0.1) + rowSources[ri]![ci]![0]());
        }),
      ),
    );
    const rowSums = Array.from({ length: ROWS }, (_, ri) =>
      ours.memo(() => {
        let s = 0;
        for (let c = 0; c < COLS; c++) s += cells[ri]![c]!();
        return s;
      }),
    );
    for (let ri = 0; ri < ROWS; ri++)
      for (let ci = 0; ci < COLS; ci++)
        rowSources[ri]![ci]![1](ci === 0 ? 100 + ((ri * 17 + 13) % 900) : 0);

    primeTable(cells, rowSums, 150);

    return { rowSources, cells, rowSums, ours };
  }

  const g = buildTable();
  const sampler = createUniqueIndexSampler(ROWS);
  const changed: number[] = [];
  const rO1 = rng(0x801);
  const rO2 = rng(0x811);

  bench(
    "ours - partial update ~2% rows, render 400 visible",
    () => {
      for (const ri of sampler(CHANGED, rO1, changed)) {
        const [r, w] = g.rowSources[ri]![0]!;
        w(r() + rO1.centered(25));
      }
      renderVisible(g.cells, g.rowSums, rO1.int(ROWS - VISIBLE));
    },
    { iterations: 80, warmupIterations: 20 },
  );

  bench(
    "ours - live col-2 update all rows, render 400 visible",
    () => {
      const delta = rO2.centered(5);
      for (let ri = 0; ri < ROWS; ri++) {
        const [r, w] = g.rowSources[ri]![2]!;
        w(r() + delta);
      }
      const start = rO2.int(ROWS - VISIBLE);
      for (let ri = start; ri < start + VISIBLE; ri++) {
        bh(g.cells[ri]![2]!());
        bh(g.rowSums[ri]!());
      }
    },
    { iterations: 100, warmupIterations: 30 },
  );
});

// ─── Suite 7: Form with derived state (2-layer) ───────────────────────────────

describe("UI: form with derived state (2-layer, 20 fields)", () => {
  const FIELDS = 20;

  function buildForm() {
    const ours = oursHarness();
    const fields = Array.from({ length: FIELDS }, (_, i) =>
      ours.signal(i * 10),
    );
    const trimmed = fields.map(([r]) => ours.memo(() => r() % 1000));
    const valid = fields.map(([r], i) =>
      ours.memo(() => (r() > 0 && trimmed[i]!() < 999 ? 1 : 0)),
    );
    const formatted = fields.map((_, i) =>
      ours.memo(() => Math.round(trimmed[i]!() * valid[i]!())),
    );
    const formValid = ours.memo(() => valid.reduce((acc, v) => acc + v(), 0));
    return { fields, formatted, formValid };
  }

  const g = buildForm();
  const rO = rng(0xa01);

  bench(
    "ours - edit 1 field, read all formatted + formValid",
    () => {
      const fi = rO.int(FIELDS);
      g.fields[fi]![2](g.fields[fi]![0]() + rO.centered(50));
      for (const r of g.formatted) bh(r());
      bh(g.formValid());
    },
    { iterations: 500, warmupIterations: 80 },
  );
});

// ─── Suite 8: Filtered + sorted list (3-layer) ────────────────────────────────

describe("UI: filtered + sorted list (3-layer, 500 items)", () => {
  const ITEMS = 500,
    PAGE = 20;

  function buildList() {
    const ours = oursHarness();
    const oursItems = Array.from({ length: ITEMS }, (_, i) => ours.signal(i));
    const oursMin = ours.signal(200);
    const oursPage = ours.signal(0);
    const oursFiltered = ours.memo(() =>
      oursItems.map(([r]) => r()).filter((v) => v >= oursMin[0]()),
    );
    const oursSorted = ours.memo(() =>
      [...oursFiltered()].sort((a, b) => a - b),
    );
    const oursSlice = ours.memo(() =>
      oursSorted().slice(oursPage[0]() * PAGE, (oursPage[0]() + 1) * PAGE),
    );
    const oursCount = ours.memo(() => oursFiltered().length);
    return { oursItems, oursMin, oursSlice, oursCount };
  }

  const g = buildList();
  const rO = rng(0xb01);

  bench(
    "ours - update 1 item, read page + count",
    () => {
      g.oursItems[rO.int(ITEMS)]![1](rO.int(ITEMS));
      for (const v of g.oursSlice()) bh(v);
      bh(g.oursCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  bench(
    "ours - change filter threshold, read page + count",
    () => {
      g.oursMin[1](rO.int(ITEMS));
      for (const v of g.oursSlice()) bh(v);
      bh(g.oursCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );
});

// ─── Suite 9: Component tree (3-layer props drilling) ─────────────────────────

describe("UI: component tree (3-layer props, 8 parents × 10 children)", () => {
  const PARENTS = 8,
    CHILDREN = 10;

  function buildTree() {
    const ours = oursHarness();
    const scale = ours.signal(1);
    const locale = ours.signal(1);
    const base = ours.signal(16);

    const parents = Array.from({ length: PARENTS }, (_, pi) => ({
      fontSize: ours.memo(() => base[0]() * scale[0]() * (1 + pi * 0.1)),
      spacing: ours.memo(() => scale[0]() * 8 * (1 + pi * 0.05)),
      rtl: ours.memo(() => locale[0]() % 2),
    }));

    const children = parents.flatMap((p, pi) =>
      Array.from({ length: CHILDREN }, (_, ci) => ({
        display: ours.memo(() => p.fontSize() * (1 + ci * 0.02)),
        margin: ours.memo(() => p.spacing() * ((ci % 3) + 1)),
        dir: ours.memo(() => p.rtl()),
        label: ours.memo(() => Math.round(p.fontSize() * 10 + ci)),
      })),
    );

    return { scale, locale, children };
  }

  const g = buildTree();
  const rO = rng(0xc01);

  function readAllChildren(
    children: {
      display: Read<number>;
      margin: Read<number>;
      dir: Read<number>;
      label: Read<number>;
    }[],
  ) {
    for (const c of children) {
      bh(c.display());
      bh(c.margin());
      bh(c.dir());
      bh(c.label());
    }
  }

  bench(
    "ours - global scale change, read all children",
    () => {
      g.scale[1](0.8 + rO.next() * 0.4);
      readAllChildren(g.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  bench(
    "ours - locale change, read all children",
    () => {
      g.locale[1](rO.int(10));
      readAllChildren(g.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );
});