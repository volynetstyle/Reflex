import { bench, describe } from "vitest";
import { createMemo, createSignal, flush } from "@solidjs/signals";
import {
  computed as createAlienComputed,
  signal as createAlienSignal,
} from "alien-signals";
import { createRuntime, signal, memo } from "../dist/esm/index";

// ─── Types ───────────────────────────────────────────────────────────────────

type Read<T> = () => T;
type Write<T> = (value: T) => void;
type Pair<T> = readonly [Read<T>, Write<T>];
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
    int: (n: number) => 0 as number, // filled below
    centered: (n: number) => 0 as number,
  };
  // Patch after closure
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

// ─── Harnesses ────────────────────────────────────────────────────────────────

function oursHarness() {
  const rt = createRuntime();
  return {
    batchWrite: rt.batchWrite.bind(rt),
    signal<T>(v: T): OursPair<T> {
      const s = signal(v);
      return [() => s(), (x: T) => s(x), s];
    },
    memo<T>(fn: () => T): Read<T> {
      const m = memo(fn);
      return () => m();
    },
  };
}

function alienHarness() {
  return {
    signal<T>(v: T): Pair<T> {
      const s = createAlienSignal(v);
      return [() => s(), (x: T) => s(x)];
    },
    memo<T>(fn: () => T): Read<T> {
      const m = createAlienComputed(fn);
      return () => m();
    },
  };
}

// Solid uses createSignal/createMemo directly, no wrapper needed.

// ─── Shared graph builders ────────────────────────────────────────────────────

/** Wide static graph: memoCount memos, each reading depCount sources */
function buildWideGraph(
  memoCount: number,
  depCount: number,
  sourceCount: number,
) {
  const ours = oursHarness();
  const alien = alienHarness();

  const oursSrc = Array.from({ length: sourceCount }, (_, i) => ours.signal(i));
  const alienSrc = Array.from({ length: sourceCount }, () => alien.signal(0));
  const solidSrc = Array.from({ length: sourceCount }, () => createSignal(0));

  const makeOursMemo = (mi: number) =>
    ours.memo(() => {
      let s = 0;
      for (let d = 0; d < depCount; d++)
        s += at(oursSrc, (mi + d * 3) % sourceCount)[0]();
      return s;
    });

  const makeAlienMemo = (mi: number) =>
    alien.memo(() => {
      let s = 0;
      for (let d = 0; d < depCount; d++)
        s += at(alienSrc, (mi + d * 3) % sourceCount)[0]();
      return s;
    });

  const makeSolidMemo = (mi: number) =>
    createMemo(() => {
      let s = 0;
      for (let d = 0; d < depCount; d++)
        s += at(solidSrc, (mi + d * 3) % sourceCount)[0]();
      return s;
    });

  const oursMemos = Array.from({ length: memoCount }, (_, i) =>
    makeOursMemo(i),
  );
  const alienMemos = Array.from({ length: memoCount }, (_, i) =>
    makeAlienMemo(i),
  );
  const solidMemos = Array.from({ length: memoCount }, (_, i) =>
    makeSolidMemo(i),
  );

  // Prime
  for (const [, w] of oursSrc) w(0);
  for (const [, w] of alienSrc) w(0);
  for (const [, w] of solidSrc) w(0);
  flush();
  primeReads(oursMemos);
  primeReads(alienMemos);
  primeReads(solidMemos);

  return {
    oursSrc,
    alienSrc,
    solidSrc,
    oursMemos,
    alienMemos,
    solidMemos,
    ours,
  };
}

/** Deep chain: chainCount chains, each depth levels deep */
function buildDeepChains(
  sourceCount: number,
  chainCount: number,
  depth: number,
) {
  const ours = oursHarness();
  const alien = alienHarness();

  const oursSrc = Array.from({ length: sourceCount }, () => ours.signal(0));
  const alienSrc = Array.from({ length: sourceCount }, () => alien.signal(0));
  const solidSrc = Array.from({ length: sourceCount }, () => createSignal(0));

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
  const alienEnds = buildChain(
    chainCount,
    (i) => alienSrc[i]![0],
    (fn) => alien.memo(fn),
  );
  const solidEnds = buildChain(
    chainCount,
    (i) => solidSrc[i]![0],
    (fn) => createMemo(fn),
  );

  for (const [, w] of oursSrc) w(0);
  for (const [, w] of alienSrc) w(0);
  for (const [, w] of solidSrc) w(0);
  flush();
  primeReads(oursEnds);
  primeReads(alienEnds);
  primeReads(solidEnds);

  return { oursSrc, alienSrc, solidSrc, oursEnds, alienEnds, solidEnds };
}

// ─── Suite 1: Wide static graph ───────────────────────────────────────────────

describe("Wide static graph (1000 memos × 5 deps)", () => {
  const MEMOS = 1000,
    DEPS = 5;

  const g2 = buildWideGraph(MEMOS, DEPS, 2);
  const g25 = buildWideGraph(MEMOS, DEPS, 25);

  const r = {
    ours2: rng(0x201),
    solid2: rng(0x202),
    alien2: rng(0x203),
    ours25: rng(0x251),
    solid25: rng(0x252),
    alien25: rng(0x253),
  };

  function runWide(
    sources: readonly (readonly [Read<number>, Write<number>])[],
    memos: readonly Read<number>[],
    r: ReturnType<typeof rng>,
    readEvery: number,
    flushFn?: () => void,
  ) {
    at(sources, r.int(sources.length))[1](r.next() * 1000);
    flushFn?.();
    for (let i = 0; i < memos.length; i += readEvery) bh(at(memos, i)());
  }

  bench(
    "ours   - 2 sources, change 1, read ~10%",
    () => runWide(g2.oursSrc, g2.oursMemos, r.ours2, 10),
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "solid  - 2 sources, change 1, flush, read ~10%",
    () => runWide(g2.solidSrc, g2.solidMemos, r.solid2, 10, flush),
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "alien  - 2 sources, change 1, read ~10%",
    () => runWide(g2.alienSrc, g2.alienMemos, r.alien2, 10),
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "ours   - 25 sources, change 1, read ~10%",
    () => runWide(g25.oursSrc, g25.oursMemos, r.ours25, 9),
    { iterations: 120, warmupIterations: 25 },
  );

  bench(
    "solid  - 25 sources, change 1, flush, read ~10%",
    () => runWide(g25.solidSrc, g25.solidMemos, r.solid25, 9, flush),
    { iterations: 120, warmupIterations: 25 },
  );

  bench(
    "alien  - 25 sources, change 1, read ~10%",
    () => runWide(g25.alienSrc, g25.alienMemos, r.alien25, 9),
    { iterations: 120, warmupIterations: 25 },
  );
});

// ─── Suite 2: Deep chains ─────────────────────────────────────────────────────

describe("Deep chains (8 × 400 depth)", () => {
  const g = buildDeepChains(4, 8, 400);
  const rO = rng(0x401),
    rS = rng(0x402),
    rA = rng(0x403);

  bench(
    "ours   - change 1 source, read 8 ends",
    () => {
      at(g.oursSrc, 1)[1](rO.next() * 200);
      for (const r of g.oursEnds) bh(r());
    },
    { iterations: 400, warmupIterations: 50 },
  );

  bench(
    "solid  - change 1 source, flush, read 8 ends",
    () => {
      at(g.solidSrc, 1)[1](rS.next() * 200);
      flush();
      for (const r of g.solidEnds) bh(r());
    },
    { iterations: 400, warmupIterations: 50 },
  );

  bench(
    "alien  - change 1 source, read 8 ends",
    () => {
      at(g.alienSrc, 1)[1](rA.next() * 200);
      for (const r of g.alienEnds) bh(r());
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
    const alien = alienHarness();

    function build<
      T extends {
        signal: (v: number) => Pair<number>;
        memo: (fn: () => number) => Read<number>;
      },
    >(h: T) {
      const sources = Array.from({ length: PATHS }, () => h.signal(0));
      const pathEnds = sources.map(([src]) => {
        let prev: Read<number> = src;
        for (let l = 0; l < DEPTH; l++) {
          const p = prev;
          prev = h.memo(() => p() * 1.0001 + l);
        }
        return prev;
      });
      const final = h.memo(() => {
        let s = 0;
        for (const r of pathEnds) s += r();
        return s;
      });
      for (const [, w] of sources) w(0);
      return { sources, final };
    }

    const oursG = build(ours);
    const alienG = build(alien);

    const solidSrc = Array.from({ length: PATHS }, () => createSignal(0));
    const solidPathEnds = solidSrc.map(([src]) => {
      let prev: Read<number> = src;
      for (let l = 0; l < DEPTH; l++) {
        const p = prev;
        prev = createMemo(() => p() * 1.0001 + l);
      }
      return prev;
    });
    const solidFinal = createMemo(() => {
      let s = 0;
      for (const r of solidPathEnds) s += r();
      return s;
    });
    for (const [, w] of solidSrc) w(0);
    flush();

    bh(oursG.final());
    bh(alienG.final());
    bh(solidFinal());

    return { oursG, alienG, solidSrc, solidFinal };
  }

  const g = buildDiamond();
  const rO = rng(0x501),
    rS = rng(0x502),
    rA = rng(0x503);

  bench(
    "ours   - change 1, read final",
    () => {
      at(g.oursG.sources, rO.int(PATHS))[1](rO.next() * 100);
      bh(g.oursG.final());
    },
    { iterations: 800, warmupIterations: 100 },
  );

  bench(
    "solid  - change 1, flush, read final",
    () => {
      at(g.solidSrc, rS.int(PATHS))[1](rS.next() * 100);
      flush();
      bh(g.solidFinal());
    },
    { iterations: 800, warmupIterations: 100 },
  );

  bench(
    "alien  - change 1, read final",
    () => {
      at(g.alienG.sources, rA.int(PATHS))[1](rA.next() * 100);
      bh(g.alienG.final());
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
    const alien = alienHarness();

    function makeMemos<
      T extends {
        signal: (v: number) => Pair<number>;
        memo: (fn: () => number) => Read<number>;
      },
    >(h: T) {
      const sources = Array.from({ length: SRCS }, () => h.signal(0));
      const memos = Array.from({ length: MEMOS }, (_, mi) =>
        h.memo(() => {
          let s = 0;
          const flip = at(sources, 0)[0]() % 3;
          for (let d = 0; d < DEPS; d++)
            s += at(sources, (mi + d + flip * 7) % SRCS)[0]();
          return s;
        }),
      );
      for (const [, w] of sources) w(0);
      primeReads(memos);
      return { sources, memos };
    }

    const oursG = makeMemos(ours);
    const alienG = makeMemos(alien);

    const solidSrc = Array.from({ length: SRCS }, () => createSignal(0));
    const solidMemos = Array.from({ length: MEMOS }, (_, mi) =>
      createMemo(() => {
        let s = 0;
        const flip = at(solidSrc, 0)[0]() % 3;
        for (let d = 0; d < DEPS; d++)
          s += at(solidSrc, (mi + d + flip * 7) % SRCS)[0]();
        return s;
      }),
    );
    for (const [, w] of solidSrc) w(0);
    flush();
    primeReads(solidMemos);

    return { oursG, alienG, solidSrc, solidMemos };
  }

  const g = buildDynamic();
  const rO = rng(0x601),
    rS = rng(0x602),
    rA = rng(0x603);

  bench(
    "ours   - flip deps, read 100%",
    () => {
      at(g.oursG.sources, 0)[1](rO.int(1000));
      for (const r of g.oursG.memos) bh(r());
    },
    { iterations: 300, warmupIterations: 50 },
  );

  bench(
    "solid  - flip deps, flush, read 100%",
    () => {
      at(g.solidSrc, 0)[1](rS.int(1000));
      flush();
      for (const r of g.solidMemos) bh(r());
    },
    { iterations: 300, warmupIterations: 50 },
  );

  bench(
    "alien  - flip deps, read 100%",
    () => {
      at(g.alienG.sources, 0)[1](rA.int(1000));
      for (const r of g.alienG.memos) bh(r());
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
    const alien = alienHarness();

    const oursSrc = Array.from({ length: SRCS }, () => ours.signal(0));
    const alienSrc = Array.from({ length: SRCS }, () => alien.signal(0));
    const solidSrc = Array.from({ length: SRCS }, () => createSignal(0));

    const makeOursMemo = (mi: number) =>
      ours.memo(() => {
        let s = 0;
        for (let d = 0; d < 6; d++) s += at(oursSrc, (mi + d) % SRCS)[0]();
        return s;
      });
    const makeAlienMemo = (mi: number) =>
      alien.memo(() => {
        let s = 0;
        for (let d = 0; d < 6; d++) s += at(alienSrc, (mi + d) % SRCS)[0]();
        return s;
      });
    const makeSolidMemo = (mi: number) =>
      createMemo(() => {
        let s = 0;
        for (let d = 0; d < 6; d++) s += at(solidSrc, (mi + d) % SRCS)[0]();
        return s;
      });

    const oursMemos = Array.from({ length: MEMOS }, (_, i) => makeOursMemo(i));
    const alienMemos = Array.from({ length: MEMOS }, (_, i) =>
      makeAlienMemo(i),
    );
    const solidMemos = Array.from({ length: MEMOS }, (_, i) =>
      makeSolidMemo(i),
    );

    for (const [, w] of oursSrc) w(0);
    for (const [, w] of alienSrc) w(0);
    for (const [, w] of solidSrc) w(0);
    flush();
    primeReads(oursMemos);
    primeReads(alienMemos);
    primeReads(solidMemos);

    const batchWrites = Array.from(
      { length: BATCH },
      (_, i) => [oursSrc[i]![2], 0] as [any, any],
    );

    return {
      oursSrc,
      alienSrc,
      solidSrc,
      oursMemos,
      alienMemos,
      solidMemos,
      batchWrites,
      ours,
    };
  }

  const g = buildBatch();
  const rO = rng(0x701),
    rS = rng(0x702),
    rA = rng(0x703);

  bench(
    "ours   - batch 20% sources, read all",
    () => {
      for (let i = 0; i < g.batchWrites.length; i++)
        g.batchWrites[i]![1] = rO.next() * 100;
      g.ours.batchWrite(g.batchWrites);
      for (const r of g.oursMemos) bh(r());
    },
    { iterations: 180, warmupIterations: 40 },
  );

  bench(
    "solid  - batch 20% sources, flush, read all",
    () => {
      for (let i = 0; i < BATCH; i++) g.solidSrc[i]![1](rS.next() * 100);
      flush();
      for (const r of g.solidMemos) bh(r());
    },
    { iterations: 180, warmupIterations: 40 },
  );

  bench(
    "alien  - write 20% sources, read all",
    () => {
      for (let i = 0; i < BATCH; i++) g.alienSrc[i]![1](rA.next() * 100);
      for (const r of g.alienMemos) bh(r());
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
    const alien = alienHarness();

    function buildFor<Sig, SrcRow extends Sig[]>(
      makeSrc: (col: number) => Sig,
      getSrc: (s: Sig) => Read<number>,
      setSrc: (s: Sig, v: number) => void,
      makeMemo: (fn: () => number) => Read<number>,
    ) {
      const rowSources = Array.from(
        { length: ROWS },
        () => Array.from({ length: COLS }, (_, c) => makeSrc(c)) as SrcRow,
      );
      const cells = Array.from({ length: ROWS }, (_, ri) =>
        Array.from({ length: COLS }, (_, ci) =>
          makeMemo(() => {
            const base = getSrc(rowSources[ri]![0]!);
            if (ci === 0) return base;
            return Math.round(
              base * (1 + ci * 0.1) + getSrc(rowSources[ri]![ci]!),
            );
          }),
        ),
      );
      const rowSums = Array.from({ length: ROWS }, (_, ri) =>
        makeMemo(() => {
          let s = 0;
          for (let c = 0; c < COLS; c++) s += cells[ri]![c]!();
          return s;
        }),
      );
      for (let ri = 0; ri < ROWS; ri++) {
        for (let ci = 0; ci < COLS; ci++)
          setSrc(
            rowSources[ri]![ci]!,
            ci === 0 ? 100 + ((ri * 17 + 13) % 900) : 0,
          );
      }
      return { rowSources, cells, rowSums };
    }

    const oursG = buildFor(
      (c) => ours.signal(c === 0 ? 100 : 0),
      ([r]) => r(),
      ([, w], v) => w(v),
      (fn) => ours.memo(fn),
    );
    const alienG = buildFor(
      (c) => alien.signal(c === 0 ? 100 : 0),
      ([r]) => r(),
      ([, w], v) => w(v),
      (fn) => alien.memo(fn),
    );
    const solidSrc = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, (_, c) => createSignal(c === 0 ? 100 : 0)),
    );
    const solidCells = Array.from({ length: ROWS }, (_, ri) =>
      Array.from({ length: COLS }, (_, ci) =>
        createMemo(() => {
          const base = solidSrc[ri]![0]![0]();
          if (ci === 0) return base;
          return Math.round(base * (1 + ci * 0.1) + solidSrc[ri]![ci]![0]());
        }),
      ),
    );
    const solidSums = Array.from({ length: ROWS }, (_, ri) =>
      createMemo(() => {
        let s = 0;
        for (let c = 0; c < COLS; c++) s += solidCells[ri]![c]!();
        return s;
      }),
    );
    for (let ri = 0; ri < ROWS; ri++)
      for (let ci = 0; ci < COLS; ci++)
        solidSrc[ri]![ci]![1](ci === 0 ? 100 + ((ri * 17 + 13) % 900) : 0);
    flush();

    primeTable(oursG.cells, oursG.rowSums, 150);
    primeTable(alienG.cells, alienG.rowSums, 150);
    primeTable(solidCells, solidSums, 150);

    return { oursG, alienG, solidSrc, solidCells, solidSums };
  }

  const g = buildTable();
  const sampler = {
    ours: createUniqueIndexSampler(ROWS),
    alien: createUniqueIndexSampler(ROWS),
    solid: createUniqueIndexSampler(ROWS),
  };
  const changed = {
    ours: [] as number[],
    alien: [] as number[],
    solid: [] as number[],
  };
  const rO1 = rng(0x801),
    rS1 = rng(0x802),
    rA1 = rng(0x803);
  const rO2 = rng(0x811),
    rS2 = rng(0x812),
    rA2 = rng(0x813);

  function updateBases(
    rowSources: any[][],
    rows: readonly number[],
    r: ReturnType<typeof rng>,
    get: (s: any) => number,
    set: (s: any, v: number) => void,
  ) {
    for (const ri of rows)
      set(rowSources[ri]![0], get(rowSources[ri]![0]) + r.centered(25));
  }

  bench(
    "ours   - partial update ~2% rows, render 400 visible",
    () => {
      updateBases(
        g.oursG.rowSources as any[][],
        sampler.ours(CHANGED, rO1, changed.ours),
        rO1,
        ([r]: [any, any]) => r(),
        ([, w]: [any, any], v: number) => w(v),
      );
      renderVisible(g.oursG.cells, g.oursG.rowSums, rO1.int(ROWS - VISIBLE));
    },
    { iterations: 80, warmupIterations: 20 },
  );

  bench(
    "solid  - partial update ~2% rows, flush, render 400 visible",
    () => {
      updateBases(
        g.solidSrc as any[][],
        sampler.solid(CHANGED, rS1, changed.solid),
        rS1,
        ([r]: [any, any]) => r(),
        ([, w]: [any, any], v: number) => w(v),
      );
      flush();
      renderVisible(g.solidCells, g.solidSums, rS1.int(ROWS - VISIBLE));
    },
    { iterations: 80, warmupIterations: 20 },
  );

  bench(
    "alien  - partial update ~2% rows, render 400 visible",
    () => {
      updateBases(
        g.alienG.rowSources as any[][],
        sampler.alien(CHANGED, rA1, changed.alien),
        rA1,
        ([r]: [any, any]) => r(),
        ([, w]: [any, any], v: number) => w(v),
      );
      renderVisible(g.alienG.cells, g.alienG.rowSums, rA1.int(ROWS - VISIBLE));
    },
    { iterations: 80, warmupIterations: 20 },
  );

  bench(
    "ours   - live col-2 update all rows, render 400 visible",
    () => {
      const delta = rO2.centered(5);
      for (let ri = 0; ri < ROWS; ri++) {
        const [r, w] = g.oursG.rowSources[ri]![2]!;
        w(r() + delta);
      }
      const start = rO2.int(ROWS - VISIBLE);
      for (let ri = start; ri < start + VISIBLE; ri++) {
        bh(g.oursG.cells[ri]![2]!());
        bh(g.oursG.rowSums[ri]!());
      }
    },
    { iterations: 100, warmupIterations: 30 },
  );

  bench(
    "solid  - live col-2 update all rows, flush, render 400 visible",
    () => {
      const delta = rS2.centered(5);
      for (let ri = 0; ri < ROWS; ri++) {
        const [r, w] = g.solidSrc[ri]![2]!;
        w(r() + delta);
      }
      flush();
      const start = rS2.int(ROWS - VISIBLE);
      for (let ri = start; ri < start + VISIBLE; ri++) {
        bh(g.solidCells[ri]![2]!());
        bh(g.solidSums[ri]!());
      }
    },
    { iterations: 100, warmupIterations: 30 },
  );

  bench(
    "alien  - live col-2 update all rows, render 400 visible",
    () => {
      const delta = rA2.centered(5);
      for (let ri = 0; ri < ROWS; ri++) {
        const [r, w] = g.alienG.rowSources[ri]![2]!;
        w(r() + delta);
      }
      const start = rA2.int(ROWS - VISIBLE);
      for (let ri = start; ri < start + VISIBLE; ri++) {
        bh(g.alienG.cells[ri]![2]!());
        bh(g.alienG.rowSums[ri]!());
      }
    },
    { iterations: 100, warmupIterations: 30 },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: Typical UI Scenarios (2–3 reactive layers)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Suite 7: Form with derived state (2-layer) ───────────────────────────────
//
// Pattern: User input signals → derived validation/formatting memos → UI reads
// Represents: search box, filter panel, address form, any controlled input chain

describe("UI: form with derived state (2-layer, 20 fields)", () => {
  const FIELDS = 20;

  function buildForm() {
    const ours = oursHarness();
    const alien = alienHarness();

    // Layer 1: raw field values (signals)
    // Layer 2: derived: trimmed + valid + formatted (memos)
    function build<Src>(
      mkSig: (v: number) => Src,
      getVal: (s: Src) => number,
      setVal: (s: Src, v: number) => void,
      mkMemo: (fn: () => number) => Read<number>,
    ) {
      const fields = Array.from({ length: FIELDS }, (_, i) => mkSig(i * 10));
      const trimmed = fields.map((f) => mkMemo(() => getVal(f) % 1000));
      const valid = fields.map((f, i) =>
        mkMemo(() => (getVal(f) > 0 && trimmed[i]!() < 999 ? 1 : 0)),
      );
      const formatted = fields.map((f, i) =>
        mkMemo(() => Math.round(trimmed[i]!() * valid[i]!())),
      );
      const formValid = mkMemo(() => valid.reduce((acc, v) => acc + v(), 0));
      return { fields, formatted, formValid, setVal };
    }

    const oursG = build(
      (v) => ours.signal(v),
      ([r]) => r(),
      ([, w], v) => w(v),
      (fn) => ours.memo(fn),
    );
    const alienG = build(
      (v) => alien.signal(v),
      ([r]) => r(),
      ([, w], v) => w(v),
      (fn) => alien.memo(fn),
    );

    const solidFields = Array.from({ length: FIELDS }, (_, i) =>
      createSignal(i * 10),
    );
    const solidTrimmed = solidFields.map(([r]) => createMemo(() => r() % 1000));
    const solidValid = solidFields.map(([r], i) =>
      createMemo(() => (r() > 0 && solidTrimmed[i]!() < 999 ? 1 : 0)),
    );
    const solidFormatted = solidFields.map((_, i) =>
      createMemo(() => Math.round(solidTrimmed[i]!() * solidValid[i]!())),
    );
    const solidFormValid = createMemo(() =>
      solidValid.reduce((acc, v) => acc + v(), 0),
    );
    flush();

    return { oursG, alienG, solidFields, solidFormatted, solidFormValid };
  }

  const g = buildForm();
  const rO = rng(0xa01),
    rS = rng(0xa02),
    rA = rng(0xa03);

  // Each tick: user edits one field, UI reads all formatted values + form validity
  bench(
    "ours   - edit 1 field, read all formatted + formValid",
    () => {
      const fi = rO.int(FIELDS);
      g.oursG.fields[fi]![2](g.oursG.fields[fi]![0]() + rO.centered(50));
      for (const r of g.oursG.formatted) bh(r());
      bh(g.oursG.formValid());
    },
    { iterations: 500, warmupIterations: 80 },
  );

  bench(
    "solid  - edit 1 field, flush, read all formatted + formValid",
    () => {
      const fi = rS.int(FIELDS);
      g.solidFields[fi]![1](g.solidFields[fi]![0]() + rS.centered(50));
      flush();
      for (const r of g.solidFormatted) bh(r());
      bh(g.solidFormValid());
    },
    { iterations: 500, warmupIterations: 80 },
  );

  bench(
    "alien  - edit 1 field, read all formatted + formValid",
    () => {
      const fi = rA.int(FIELDS);
      g.alienG.fields[fi]![1](g.alienG.fields[fi]![0]() + rA.centered(50));
      for (const r of g.alienG.formatted) bh(r());
      bh(g.alienG.formValid());
    },
    { iterations: 500, warmupIterations: 80 },
  );
});

// ─── Suite 8: Filtered + sorted list (3-layer) ────────────────────────────────
//
// Pattern: items[] signal → filter memo → sort memo → sliced page memo
// Represents: data grid, inbox, product listing, autocomplete dropdown

describe("UI: filtered + sorted list (3-layer, 500 items)", () => {
  const ITEMS = 500,
    PAGE = 20;

  function buildList() {
    const ours = oursHarness();
    const alien = alienHarness();

    function build<Src>(
      mkSig: (v: number) => Src,
      getVal: (s: Src) => number,
      setVal: (s: Src, v: number) => void,
      mkMemo: (fn: () => number[]) => Read<number[]>,
      mkNumMemo: (fn: () => number) => Read<number>,
    ) {
      const items = Array.from({ length: ITEMS }, (_, i) => mkSig(i));
      const minSig = mkSig(200);
      const pageSig = mkSig(0);

      // Layer 1→2: filter
      const filtered = mkMemo(() =>
        items.map(getVal).filter((v) => v >= getVal(minSig)),
      );
      // Layer 2→3: sort
      const sorted = mkMemo(() => [...filtered()].sort((a, b) => a - b));
      // Layer 3→4: page slice
      const page = mkMemo(() =>
        sorted().slice(getVal(pageSig) * PAGE, (getVal(pageSig) + 1) * PAGE),
      );
      const count = mkNumMemo(() => filtered().length);

      return { items, minSig, pageSig, page, count, setVal };
    }

    // ours
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

    // alien
    const alienItems = Array.from({ length: ITEMS }, (_, i) => alien.signal(i));
    const alienMin = alien.signal(200);
    const alienPage = alien.signal(0);
    const alienFiltered = alien.memo(() =>
      alienItems.map(([r]) => r()).filter((v) => v >= alienMin[0]()),
    );
    const alienSorted = alien.memo(() =>
      [...alienFiltered()].sort((a, b) => a - b),
    );
    const alienSlice = alien.memo(() =>
      alienSorted().slice(alienPage[0]() * PAGE, (alienPage[0]() + 1) * PAGE),
    );
    const alienCount = alien.memo(() => alienFiltered().length);

    // solid
    const solidItems = Array.from({ length: ITEMS }, (_, i) => createSignal(i));
    const [solidMin, setMin] = createSignal(200);
    const [solidPage, setPage] = createSignal(0);
    const solidFiltered = createMemo(() =>
      solidItems.map(([r]) => r()).filter((v) => v >= solidMin()),
    );
    const solidSorted = createMemo(() =>
      [...solidFiltered()].sort((a, b) => a - b),
    );
    const solidSlice = createMemo(() =>
      solidSorted().slice(solidPage() * PAGE, (solidPage() + 1) * PAGE),
    );
    const solidCount = createMemo(() => solidFiltered().length);
    flush();

    return {
      oursItems,
      oursMin,
      oursSlice,
      oursCount,
      alienItems,
      alienMin,
      alienSlice,
      alienCount,
      solidItems,
      setMin,
      solidSlice,
      solidCount,
    };
  }

  const g = buildList();
  const rO = rng(0xb01),
    rS = rng(0xb02),
    rA = rng(0xb03);

  // Tick: update a random item's value, read page + count
  bench(
    "ours   - update 1 item, read page + count",
    () => {
      g.oursItems[rO.int(ITEMS)]![1](rO.int(ITEMS));
      for (const v of g.oursSlice()) bh(v);
      bh(g.oursCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  bench(
    "solid  - update 1 item, flush, read page + count",
    () => {
      g.solidItems[rS.int(ITEMS)]![1](rS.int(ITEMS));
      flush();
      for (const v of g.solidSlice()) bh(v);
      bh(g.solidCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  bench(
    "alien  - update 1 item, read page + count",
    () => {
      g.alienItems[rA.int(ITEMS)]![1](rA.int(ITEMS));
      for (const v of g.alienSlice()) bh(v);
      bh(g.alienCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  // Tick: change filter threshold → all pages invalidate
  bench(
    "ours   - change filter threshold, read page + count",
    () => {
      g.oursMin[1](rO.int(ITEMS));
      for (const v of g.oursSlice()) bh(v);
      bh(g.oursCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  bench(
    "solid  - change filter threshold, flush, read page + count",
    () => {
      g.setMin(rS.int(ITEMS));
      flush();
      for (const v of g.solidSlice()) bh(v);
      bh(g.solidCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );

  bench(
    "alien  - change filter threshold, read page + count",
    () => {
      g.alienMin[1](rA.int(ITEMS));
      for (const v of g.alienSlice()) bh(v);
      bh(g.alienCount());
    },
    { iterations: 300, warmupIterations: 60 },
  );
});

// ─── Suite 9: Component tree (3-layer props drilling) ─────────────────────────
//
// Pattern: app state → parent derived props → child derived display values
// Represents: theme/locale context, permission-derived visibility, layout config

describe("UI: component tree (3-layer props, 8 parents × 10 children)", () => {
  const PARENTS = 8,
    CHILDREN = 10;

  function buildTree() {
    const ours = oursHarness();
    const alien = alienHarness();

    // Layer 0: 3 global app signals (theme scale, locale multiplier, base font)
    // Layer 1: PARENTS parent components derive layout values from globals
    // Layer 2: PARENTS*CHILDREN leaf components derive display values from parent

    function build(
      mkSig: (v: number) => [Read<number>, Write<number>],
      mkMemo: (fn: () => number) => Read<number>,
    ) {
      const scale = mkSig(1);
      const locale = mkSig(1);
      const base = mkSig(16);

      const parents = Array.from({ length: PARENTS }, (_, pi) => ({
        fontSize: mkMemo(() => base[0]() * scale[0]() * (1 + pi * 0.1)),
        spacing: mkMemo(() => scale[0]() * 8 * (1 + pi * 0.05)),
        rtl: mkMemo(() => locale[0]() % 2),
      }));

      const children = parents.flatMap((p, pi) =>
        Array.from({ length: CHILDREN }, (_, ci) => ({
          display: mkMemo(() => p.fontSize() * (1 + ci * 0.02)),
          margin: mkMemo(() => p.spacing() * ((ci % 3) + 1)),
          dir: mkMemo(() => p.rtl()),
          label: mkMemo(() => Math.round(p.fontSize() * 10 + ci)),
        })),
      );

      return { scale, locale, base, children };
    }

    const oursG = build(
      (v) => ours.signal(v),
      (fn) => ours.memo(fn),
    );
    const alienG = build(
      (v) => alien.signal(v),
      (fn) => alien.memo(fn),
    );

    const [solidScale, setScale] = createSignal(1);
    const [solidLocale, setLocale] = createSignal(1);
    const [solidBase, setBase] = createSignal(16);
    const solidParents = Array.from({ length: PARENTS }, (_, pi) => ({
      fontSize: createMemo(() => solidBase() * solidScale() * (1 + pi * 0.1)),
      spacing: createMemo(() => solidScale() * 8 * (1 + pi * 0.05)),
      rtl: createMemo(() => solidLocale() % 2),
    }));
    const solidChildren = solidParents.flatMap((p, pi) =>
      Array.from({ length: CHILDREN }, (_, ci) => ({
        display: createMemo(() => p.fontSize() * (1 + ci * 0.02)),
        margin: createMemo(() => p.spacing() * ((ci % 3) + 1)),
        dir: createMemo(() => p.rtl()),
        label: createMemo(() => Math.round(p.fontSize() * 10 + ci)),
      })),
    );
    flush();

    return { oursG, alienG, solidChildren, setScale, setLocale };
  }

  const g = buildTree();
  const rO = rng(0xc01),
    rS = rng(0xc02),
    rA = rng(0xc03);

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

  // Global scale change → all parents + all children invalidate (full tree re-render)
  bench(
    "ours   - global scale change, read all children",
    () => {
      g.oursG.scale[1](0.8 + rO.next() * 0.4);
      readAllChildren(g.oursG.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  bench(
    "solid  - global scale change, flush, read all children",
    () => {
      g.setScale(0.8 + rS.next() * 0.4);
      flush();
      readAllChildren(g.solidChildren);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  bench(
    "alien  - global scale change, read all children",
    () => {
      g.alienG.scale[1](0.8 + rA.next() * 0.4);
      readAllChildren(g.alienG.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  // Locale change → only rtl/dir chain invalidates (partial tree)
  bench(
    "ours   - locale change, read all children",
    () => {
      g.oursG.locale[1](rO.int(10));
      readAllChildren(g.oursG.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  bench(
    "solid  - locale change, flush, read all children",
    () => {
      g.setLocale(rS.int(10));
      flush();
      readAllChildren(g.solidChildren);
    },
    { iterations: 600, warmupIterations: 80 },
  );

  bench(
    "alien  - locale change, read all children",
    () => {
      g.alienG.locale[1](rA.int(10));
      readAllChildren(g.alienG.children);
    },
    { iterations: 600, warmupIterations: 80 },
  );
});
