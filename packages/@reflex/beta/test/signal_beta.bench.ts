import { describe, bench, expect } from "vitest";
import { createSignal, createMemo, flush } from "@solidjs/signals";
import { createRuntime } from "../dist/esm";

// Anti-JIT sink (щоб V8 не викинув обчислення)
let sinkAcc = 0;
function blackhole(n: number) {
  sinkAcc = (sinkAcc * 100019 + (n | 0)) | 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeOurs() {
  const rt = createRuntime();
  return {
    signal: <T>(v: T) => {
      const s = rt.signal(v);
      return [() => s.read(), (val: T) => s.write(val)] as const;
    },
    computed: <T>(fn: () => T) => {
      const c = rt.computed(fn);
      return () => c();
    },
  };
}

// // ─────────────────────────────────────────────────────────────────────────────
// // Wide static: 1000 computed × 5 deps, read ~10–20%
// // ─────────────────────────────────────────────────────────────────────────────

describe("Wide static graph (1000 memos × 5 deps)", () => {
  const N = 1000;
  const DEPS = 5;

  function buildWide(sourcesCount: number) {
    const ours = makeOurs();
    const sources = Array.from({ length: sourcesCount }, (_, i) =>
      ours.signal(i),
    );

    const memos = Array.from({ length: N }, (_, i) =>
      ours.computed(() => {
        let sum = 0;
        for (let d = 0; d < DEPS; d++) {
          sum += sources[(i + d * 3) % sourcesCount][0]();
        }
        return sum;
      }),
    );

    // initial settle
    sources.forEach(([, set]) => set(0));
    memos.forEach((m) => blackhole(m()));

    return { sources, memos };
  }

  const ours2 = buildWide(2);
  const solid2 = (() => {
    const srcs = Array.from({ length: 2 }, () => createSignal(0));
    const memos = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        for (let d = 0; d < DEPS; d++) {
          sum += srcs[(i + d * 3) % 2][0]();
        }
        return sum;
      }),
    );
    srcs.forEach(([, s]) => s(0));
    flush();
    memos.forEach((m) => blackhole(m()));
    return { sources: srcs, memos };
  })();

  const ours25 = buildWide(25);
  const solid25 = (() => {
    const srcs = Array.from({ length: 25 }, () => createSignal(0));
    const memos = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        for (let d = 0; d < DEPS; d++) {
          sum += srcs[(i + d * 3) % 25][0]();
        }
        return sum;
      }),
    );
    srcs.forEach(([, s]) => s(0));
    flush();
    memos.forEach((m) => blackhole(m()));
    return { sources: srcs, memos };
  })();

  bench(
    "ours — 2 sources, change 1, read ~10%",
    () => {
      const idx = Math.floor(Math.random() * 2);
      ours2.sources[idx][1](Math.random() * 1000);
      for (let i = 0; i < N; i += 10) {
        blackhole(ours2.memos[i]());
      }
    },
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "solid — 2 sources, change 1, flush + read ~10%",
    () => {
      const idx = Math.floor(Math.random() * 2);
      solid2.sources[idx][1](Math.random() * 1000);
      flush();
      for (let i = 0; i < N; i += 10) {
        blackhole(solid2.memos[i]());
      }
    },
    { iterations: 150, warmupIterations: 30 },
  );

  bench(
    "ours — 25 sources, change 1, read ~10%",
    () => {
      const idx = Math.floor(Math.random() * 25);
      ours25.sources[idx][1](Math.random() * 1000);
      for (let i = 0; i < N; i += 9) {
        blackhole(ours25.memos[i]());
      }
    },
    { iterations: 120, warmupIterations: 25 },
  );

  bench(
    "solid — 25 sources, change 1, flush + read ~10%",
    () => {
      const idx = Math.floor(Math.random() * 25);
      solid25.sources[idx][1](Math.random() * 1000);
      flush();
      for (let i = 0; i < N; i += 9) {
        blackhole(solid25.memos[i]());
      }
    },
    { iterations: 120, warmupIterations: 25 },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Deep chains: 8 ланцюгів × 400 вузлів
// ─────────────────────────────────────────────────────────────────────────────

describe("Deep chains (8 × 400 depth)", () => {
  function buildDeep() {
    const ours = makeOurs();
    const sources = Array.from({ length: 4 }, () => ours.signal(0));
    const ends: Array<() => number> = [];

    for (let chain = 0; chain < 8; chain++) {
      let prev = sources[chain % 4][0];
      for (let depth = 0; depth < 400; depth++) {
        const p = prev;
        prev = ours.computed(() => p());
      }
      ends.push(prev);
    }

    sources.forEach(([, s]) => s(0));
    ends.forEach((e) => blackhole(e()));

    return { sources, ends };
  }

  const ours1 = buildDeep();
  const solid1 = (() => {
    const srcs = Array.from({ length: 4 }, () => createSignal(0));
    const ends: Array<() => number> = [];
    for (let chain = 0; chain < 8; chain++) {
      let prev = srcs[chain % 4][0];
      for (let d = 0; d < 400; d++) {
        const p = prev;
        prev = createMemo(() => p());
      }
      ends.push(prev as any);
    }
    srcs.forEach(([, s]) => s(0));
    flush();
    ends.forEach((e) => blackhole(e()));
    return { sources: srcs, ends };
  })();

  bench(
    "ours — change 1 source → read 8 ends",
    () => {
      ours1.sources[1][1](Math.random() * 200);
      ours1.ends.forEach((e) => blackhole(e()));
    },
    { iterations: 400, warmupIterations: 50 },
  );

  bench(
    "solid — change 1 source → flush → read 8 ends",
    () => {
      solid1.sources[1][1](Math.random() * 200);
      flush();
      solid1.ends.forEach((e) => blackhole(e()));
    },
    { iterations: 400, warmupIterations: 50 },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DIAMOND / FAN-OUT → FAN-IN (200 шляхів сходження в один final)
// Pull виграє СИЛЬНО, бо:
// • при зміні 1 джерела тільки 1 шлях стає dirty
// • ensureFresh(final) робить 200 швидких timestamp-перевірок
//   (199 — skip, 1 — рекурсія глибиною 5)
// • Solid flush() має overhead на сповіщення + scheduler
//   навіть якщо реально оновлює тільки 1 шлях
// ─────────────────────────────────────────────────────────────────────────────
describe("Diamond / Fan-out → Fan-in (200 paths converge)", () => {
  const PATHS = 200;
  const DEPTH = 5;

  function buildDiamond() {
    const ours = makeOurs();
    const sources = Array.from({ length: PATHS }, () => ours.signal(0));

    // для кожного шляху — приватний ланцюжок глибиною DEPTH
    const pathEnds: Array<() => number> = [];
    for (let p = 0; p < PATHS; p++) {
      let prev = sources[p][0];
      for (let d = 0; d < DEPTH; d++) {
        const pFn = prev;
        prev = ours.computed(() => pFn() * 1.0001 + d); // невелике обчислення
      }
      pathEnds.push(prev);
    }

    // фінальний computed — fan-in
    const final = ours.computed(() => {
      let sum = 0;
      for (const e of pathEnds) sum += e();
      return sum;
    });

    // initial settle
    sources.forEach(([, set]) => set(0));
    blackhole(final());

    return { sources, final };
  }

  const oursDiamond = buildDiamond();
  const solidDiamond = (() => {
    const srcs = Array.from({ length: PATHS }, () => createSignal(0));
    const pathEnds: Array<() => number> = [];
    for (let p = 0; p < PATHS; p++) {
      let prev = srcs[p][0];
      for (let d = 0; d < DEPTH; d++) {
        const pFn = prev;
        prev = createMemo(() => pFn() * 1.0001 + d);
      }
      pathEnds.push(prev as any);
    }
    const final = createMemo(() => {
      let sum = 0;
      for (const e of pathEnds) sum += e();
      return sum;
    });
    srcs.forEach(([, s]) => s(0));
    flush();
    blackhole(final());
    return { sources: srcs, final };
  })();

  bench(
    "ours — change 1 source → read final (diamond pull win)",
    () => {
      const idx = Math.floor(Math.random() * PATHS);
      oursDiamond.sources[idx][1](Math.random() * 100);
      blackhole(oursDiamond.final());
    },
    { iterations: 800, warmupIterations: 100 },
  );

  bench(
    "solid — change 1 source → flush → read final",
    () => {
      const idx = Math.floor(Math.random() * PATHS);
      solidDiamond.sources[idx][1](Math.random() * 100);
      flush();
      blackhole(solidDiamond.final());
    },
    { iterations: 800, warmupIterations: 100 },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC DEPS + FREQUENT TRACKING INVALIDATION
// Solid платить за повну перебудову залежностей при кожному flush()
// Наш runtime — тільки якщо дійсно читаємо і trackingScope змінився
// ─────────────────────────────────────────────────────────────────────────────
describe("Dynamic deps + frequent flip (tracking invalidation)", () => {
  const N = 150;
  const DEPS = 12;

  function buildDynamic() {
    const ours = makeOurs();
    const sources = Array.from({ length: 12 }, () => ours.signal(0));

    const memos = Array.from({ length: N }, (_, i) =>
      ours.computed(() => {
        let sum = 0;
        const flip = sources[0][0]() % 3; // 0,1,2 — різні набори залежностей
        for (let d = 0; d < DEPS; d++) {
          const srcIdx = (i + d + flip * 7) % sources.length;
          sum += sources[srcIdx][0]();
        }
        return sum;
      }),
    );

    sources.forEach(([, s]) => s(0));
    memos.forEach((m) => blackhole(m()));

    return { sources, memos };
  }

  const oursDyn = buildDynamic();
  const solidDyn = (() => {
    const srcs = Array.from({ length: 12 }, () => createSignal(0));
    const memos = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        const flip = srcs[0][0]() % 3;
        for (let d = 0; d < DEPS; d++) {
          const srcIdx = (i + d + flip * 7) % srcs.length;
          sum += srcs[srcIdx][0]();
        }
        return sum;
      }),
    );
    srcs.forEach(([, s]) => s(0));
    flush();
    memos.forEach((m) => blackhole(m()));
    return { sources: srcs, memos };
  })();

  bench(
    "ours — flip deps every tick + read 100%",
    () => {
      oursDyn.sources[0][1]((Math.random() * 1000) | 0);
      oursDyn.memos.forEach((m) => blackhole(m()));
    },
    { iterations: 300, warmupIterations: 50 },
  );

  bench(
    "solid — flip deps every tick + flush + read 100%",
    () => {
      solidDyn.sources[0][1]((Math.random() * 1000) | 0);
      flush();
      solidDyn.memos.forEach((m) => blackhole(m()));
    },
    { iterations: 300, warmupIterations: 50 },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// LARGE BATCH WRITE (20% sources одночасно) + повне читання
// Тут Solid може наздогнати або навіть обійти — бо flush() обробляє
// всі dirty вузли за один прохід з оптимальним порядком.
// Pull має перевіряти кожен read() окремо.
// ─────────────────────────────────────────────────────────────────────────────
describe("Large batch write (20% sources) + full read", () => {
  const N = 800;
  const SOURCES = 80;
  const BATCH_PCT = 0.2;

  function buildBatch() {
    const ours = makeOurs();
    const sources = Array.from({ length: SOURCES }, () => ours.signal(0));
    const memos = Array.from({ length: N }, (_, i) =>
      ours.computed(() => {
        let sum = 0;
        for (let d = 0; d < 6; d++) sum += sources[(i + d) % SOURCES][0]();
        return sum;
      }),
    );

    sources.forEach(([, s]) => s(0));
    memos.forEach((m) => blackhole(m()));

    return { sources, memos };
  }

  const oursBatch = buildBatch();
  const solidBatch = (() => {
    const srcs = Array.from({ length: SOURCES }, () => createSignal(0));
    const memos = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        for (let d = 0; d < 6; d++) sum += srcs[(i + d) % SOURCES][0]();
        return sum;
      }),
    );
    srcs.forEach(([, s]) => s(0));
    flush();
    memos.forEach((m) => blackhole(m()));
    return { sources: srcs, memos };
  })();

  bench(
    "ours — batch 20% sources + read all",
    () => {
      const batchSize = Math.floor(SOURCES * BATCH_PCT);
      for (let i = 0; i < batchSize; i++) {
        oursBatch.sources[i][1](Math.random() * 100);
      }
      oursBatch.memos.forEach((m) => blackhole(m()));
    },
    { iterations: 180, warmupIterations: 40 },
  );

  bench(
    "solid — batch 20% sources + flush + read all",
    () => {
      const batchSize = Math.floor(SOURCES * BATCH_PCT);
      for (let i = 0; i < batchSize; i++) {
        solidBatch.sources[i][1](Math.random() * 100);
      }
      flush();
      solidBatch.memos.forEach((m) => blackhole(m()));
    },
    { iterations: 180, warmupIterations: 40 },
  );
});

describe("Realistic UI: Virtualized table 4000 rows × 6 cols, partial update", () => {
  const ROWS = 4000;
  const COLS = 6;
  const VISIBLE_ROWS = 400;          // збільшено для стабільного вимірювання
  const CHANGED_PCT = 0.02;          // ~80 рядків змінюється
  // const LIVE_COL = true;          // не використовується напряму

  function buildTable() {
    const ours = makeOurs();

    const rowSources = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, (_, c) =>
        ours.signal(c === 0 ? 100 + Math.random() * 900 : 0)
      )
    );

    const cells = Array.from({ length: ROWS }, (_, rowIdx) =>
      Array.from({ length: COLS }, (_, colIdx) =>
        ours.computed(() => {
          const base = rowSources[rowIdx][0][0]();
          if (colIdx === 0) return base;
          return Math.round(
            base * (1 + colIdx * 0.1) + rowSources[rowIdx][colIdx][0]()
          );
        })
      )
    );

    const rowSums = Array.from({ length: ROWS }, (_, rowIdx) =>
      ours.computed(() => {
        let sum = 0;
        for (let c = 0; c < COLS; c++) sum += cells[rowIdx][c]();
        return sum;
      })
    );

    // initial write + settle
    rowSources.forEach((row) =>
      row.forEach(([, set], c) => set(c === 0 ? 100 + Math.random() * 900 : 0))
    );

    // warmup: читаємо розкидані рядки кілька разів
    for (let pass = 0; pass < 4; pass++) {
      for (let r = 0; r < ROWS; r += 150) {
        cells[r][0]();
        cells[r][1]();
        cells[r][2]();
        cells[r][3]();
        rowSums[r]();
      }
    }

    return { rowSources, cells, rowSums };
  }

  const oursTable = buildTable();

  const solidTable = (() => {
    const srcs = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, (_, c) => createSignal(c === 0 ? 100 + Math.random() * 900 : 0))
    );

    const cells = Array.from({ length: ROWS }, (_, rowIdx) =>
      Array.from({ length: COLS }, (_, colIdx) =>
        createMemo(() => {
          const base = srcs[rowIdx][0][0]();
          if (colIdx === 0) return base;
          const extra = srcs[rowIdx][colIdx][0]();
          return Math.round(base * (1 + colIdx * 0.1) + extra);
        })
      )
    );

    const rowSums = Array.from({ length: ROWS }, (_, rowIdx) =>
      createMemo(() => {
        let sum = 0;
        for (let c = 0; c < COLS; c++) sum += cells[rowIdx][c]();
        return sum;
      })
    );

    srcs.forEach((row) =>
      row.forEach(([, setter], colIdx) =>
        setter(colIdx === 0 ? 100 + Math.random() * 900 : 0)
      )
    );
    flush();

    // warmup
    for (let pass = 0; pass < 4; pass++) {
      for (let r = 0; r < ROWS; r += 150) {
        cells[r][0]();
        cells[r][1]();
        cells[r][2]();
        cells[r][3]();
        rowSums[r]();
      }
    }

    return { rowSources: srcs, cells, rowSums };
  })();

  // ── Partial update: ~2% рядків (80 шт) ─────────────────────────────────────
  bench(
    "ours — partial update ~2% rows → render 400 visible rows",
    () => {
      const changedCount = Math.floor(ROWS * CHANGED_PCT);
      const indices = new Set<number>();
      while (indices.size < changedCount) {
        indices.add(Math.floor(Math.random() * ROWS));
      }

      for (const rowIdx of indices) {
        const delta = Math.random() * 50 - 25;
        const current = oursTable.rowSources[rowIdx][0][0]();
        oursTable.rowSources[rowIdx][0][1](current + delta);
      }

      const start = Math.floor(Math.random() * (ROWS - VISIBLE_ROWS));
      for (let r = start; r < start + VISIBLE_ROWS; r++) {
        blackhole(oursTable.rowSums[r]());
        for (let c = 0; c < COLS; c++) {
          blackhole(oursTable.cells[r][c]());
        }
      }
    },
    { iterations: 80, warmupIterations: 20 }   // менше ітерацій, бо повільніше
  );

  bench(
    "solid — partial update ~2% rows → flush → render 400 visible rows",
    () => {
      const changedCount = Math.floor(ROWS * CHANGED_PCT);
      const indices = new Set<number>();
      while (indices.size < changedCount) {
        indices.add(Math.floor(Math.random() * ROWS));
      }

      for (const rowIdx of indices) {
        const delta = Math.random() * 50 - 25;
        const current = solidTable.rowSources[rowIdx][0][0]();
        solidTable.rowSources[rowIdx][0][1](current + delta);
      }

      flush();

      const start = Math.floor(Math.random() * (ROWS - VISIBLE_ROWS));
      for (let r = start; r < start + VISIBLE_ROWS; r++) {
        blackhole(solidTable.rowSums[r]());
        for (let c = 0; c < COLS; c++) {
          blackhole(solidTable.cells[r][c]());
        }
      }
    },
    { iterations: 80, warmupIterations: 20 }
  );

  // ── Live column update: змінюємо одну колонку в усіх 4000 рядках ────────────
  bench(
    "ours — live column (col 2) update all rows → render 400 visible",
    () => {
      const delta = Math.random() * 10 - 5;
      for (let r = 0; r < ROWS; r++) {
        const current = oursTable.rowSources[r][2][0]();
        oursTable.rowSources[r][2][1](current + delta);
      }

      const start = Math.floor(Math.random() * (ROWS - VISIBLE_ROWS));
      for (let r = start; r < start + VISIBLE_ROWS; r++) {
        blackhole(oursTable.cells[r][2]());   // змінена колонка
        blackhole(oursTable.rowSums[r]());     // бо сума залежить від неї
      }
    },
    { iterations: 100, warmupIterations: 30 }
  );

  bench(
    "solid — live column (col 2) update all rows → flush → render 400 visible",
    () => {
      const delta = Math.random() * 10 - 5;
      for (let r = 0; r < ROWS; r++) {
        const current = solidTable.rowSources[r][2][0]();
        solidTable.rowSources[r][2][1](current + delta);
      }

      flush();

      const start = Math.floor(Math.random() * (ROWS - VISIBLE_ROWS));
      for (let r = start; r < start + VISIBLE_ROWS; r++) {
        blackhole(solidTable.cells[r][2]());
        blackhole(solidTable.rowSums[r]());
      }
    },
    { iterations: 100, warmupIterations: 30 }
  );
});