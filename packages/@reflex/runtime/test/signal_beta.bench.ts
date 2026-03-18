import { bench, describe } from "vitest";
import { createMemo, createSignal, flush } from "@solidjs/signals";
import { createRuntime, type BatchWriteEntry, type Signal } from "../dist/esm/index.js";

type Read<T> = () => T;
type Write<T> = (value: T) => void;
type OursSignal<T> = readonly [Read<T>, Write<T>, Signal<T>];
type SolidSignal<T> = readonly [Read<T>, Write<T>];

let sinkAcc = 0;

function blackhole(value: number): void {
  sinkAcc = (sinkAcc * 100_019 + (value | 0)) | 0;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing item at index ${index}`);
  }
  return item;
}

function createRng(seed: number) {
  let state = seed | 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
    centered(span: number): number {
      return this.next() * span * 2 - span;
    },
  };
}

function primeReads(reads: readonly Read<number>[]): void {
  for (const read of reads) {
    blackhole(read());
  }
}

function createOursHarness() {
  const runtime = createRuntime();

  return {
    batchWrite(writes: ReadonlyArray<BatchWriteEntry>) {
      runtime.batchWrite(writes);
    },
    signal<T>(initial: T): OursSignal<T> {
      const signal = runtime.signal(initial);
      return [() => signal.read(), (value: T) => signal.write(value), signal];
    },
    memo<T>(compute: () => T): Read<T> {
      const memo = runtime.memo(compute);
      return () => memo();
    },
  };
}

describe("Wide static graph (1000 memos x 5 deps)", () => {
  const memoCount = 1000;
  const depCount = 5;
  const readEvery10 = 10;
  const readEvery9 = 9;

  function buildOurs(sourceCount: number) {
    const ours = createOursHarness();
    const sources = Array.from({ length: sourceCount }, (_, index) =>
      ours.signal(index),
    );
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;
        for (let depIndex = 0; depIndex < depCount; depIndex++) {
          sum += at(sources, (memoIndex + depIndex * 3) % sourceCount)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    primeReads(memos);

    return { sources, memos };
  }

  function buildSolid(sourceCount: number) {
    const sources = Array.from({ length: sourceCount }, () => createSignal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      createMemo(() => {
        let sum = 0;
        for (let depIndex = 0; depIndex < depCount; depIndex++) {
          sum += at(sources, (memoIndex + depIndex * 3) % sourceCount)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    flush();
    primeReads(memos);

    return { sources, memos };
  }

  const ours2 = buildOurs(2);
  const solid2 = buildSolid(2);
  const ours25 = buildOurs(25);
  const solid25 = buildSolid(25);
  const rngOurs2 = createRng(0x201);
  const rngSolid2 = createRng(0x202);
  const rngOurs25 = createRng(0x251);
  const rngSolid25 = createRng(0x252);

  bench("beta build - 2 sources, change 1, read ~10%", () => {
    at(ours2.sources, rngOurs2.int(2))[1](rngOurs2.next() * 1000);
    for (let index = 0; index < memoCount; index += readEvery10) {
      blackhole(at(ours2.memos, index)());
    }
  }, { iterations: 150, warmupIterations: 30 });

  bench("solid signals - 2 sources, change 1, flush, read ~10%", () => {
    at(solid2.sources, rngSolid2.int(2))[1](rngSolid2.next() * 1000);
    flush();
    for (let index = 0; index < memoCount; index += readEvery10) {
      blackhole(at(solid2.memos, index)());
    }
  }, { iterations: 150, warmupIterations: 30 });

  bench("beta build - 25 sources, change 1, read ~10%", () => {
    at(ours25.sources, rngOurs25.int(25))[1](rngOurs25.next() * 1000);
    for (let index = 0; index < memoCount; index += readEvery9) {
      blackhole(at(ours25.memos, index)());
    }
  }, { iterations: 120, warmupIterations: 25 });

  bench("solid signals - 25 sources, change 1, flush, read ~10%", () => {
    at(solid25.sources, rngSolid25.int(25))[1](rngSolid25.next() * 1000);
    flush();
    for (let index = 0; index < memoCount; index += readEvery9) {
      blackhole(at(solid25.memos, index)());
    }
  }, { iterations: 120, warmupIterations: 25 });
});

describe("Deep chains (8 x 400 depth)", () => {
  const sourceCount = 4;
  const chainCount = 8;
  const depth = 400;

  function buildOurs() {
    const ours = createOursHarness();
    const sources = Array.from({ length: sourceCount }, () => ours.signal(0));
    const ends: Array<Read<number>> = [];

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex++) {
      let prev = at(sources, chainIndex % sourceCount)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = ours.memo(() => readPrev());
      }
      ends.push(prev);
    }

    for (const [, write] of sources) {
      write(0);
    }
    primeReads(ends);

    return { sources, ends };
  }

  function buildSolid() {
    const sources = Array.from({ length: sourceCount }, () => createSignal(0));
    const ends: Array<Read<number>> = [];

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex++) {
      let prev = at(sources, chainIndex % sourceCount)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = createMemo(() => readPrev());
      }
      ends.push(prev);
    }

    for (const [, write] of sources) {
      write(0);
    }
    flush();
    primeReads(ends);

    return { sources, ends };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const rngOurs = createRng(0x401);
  const rngSolid = createRng(0x402);

  bench("beta build - change 1 source, read 8 ends", () => {
    at(ours.sources, 1)[1](rngOurs.next() * 200);
    for (const read of ours.ends) {
      blackhole(read());
    }
  }, { iterations: 400, warmupIterations: 50 });

  bench("solid signals - change 1 source, flush, read 8 ends", () => {
    at(solid.sources, 1)[1](rngSolid.next() * 200);
    flush();
    for (const read of solid.ends) {
      blackhole(read());
    }
  }, { iterations: 400, warmupIterations: 50 });
});

describe("Diamond / Fan-out -> Fan-in (200 paths converge)", () => {
  const pathCount = 200;
  const depth = 5;

  function buildOurs() {
    const ours = createOursHarness();
    const sources = Array.from({ length: pathCount }, () => ours.signal(0));
    const pathEnds: Array<Read<number>> = [];

    for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
      let prev = at(sources, pathIndex)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = ours.memo(() => readPrev() * 1.0001 + level);
      }
      pathEnds.push(prev);
    }

    const final = ours.memo(() => {
      let sum = 0;
      for (const read of pathEnds) {
        sum += read();
      }
      return sum;
    });

    for (const [, write] of sources) {
      write(0);
    }
    blackhole(final());

    return { sources, final };
  }

  function buildSolid() {
    const sources = Array.from({ length: pathCount }, () => createSignal(0));
    const pathEnds: Array<Read<number>> = [];

    for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
      let prev = at(sources, pathIndex)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = createMemo(() => readPrev() * 1.0001 + level);
      }
      pathEnds.push(prev);
    }

    const final = createMemo(() => {
      let sum = 0;
      for (const read of pathEnds) {
        sum += read();
      }
      return sum;
    });

    for (const [, write] of sources) {
      write(0);
    }
    flush();
    blackhole(final());

    return { sources, final };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const rngOurs = createRng(0x501);
  const rngSolid = createRng(0x502);

  bench("beta build - change 1 source, read final", () => {
    at(ours.sources, rngOurs.int(pathCount))[1](rngOurs.next() * 100);
    blackhole(ours.final());
  }, { iterations: 800, warmupIterations: 100 });

  bench("solid signals - change 1 source, flush, read final", () => {
    at(solid.sources, rngSolid.int(pathCount))[1](rngSolid.next() * 100);
    flush();
    blackhole(solid.final());
  }, { iterations: 800, warmupIterations: 100 });
});

describe("Dynamic deps + frequent flip (tracking invalidation)", () => {
  const memoCount = 150;
  const sourceCount = 12;
  const depCount = 12;

  function buildOurs() {
    const ours = createOursHarness();
    const sources = Array.from({ length: sourceCount }, () => ours.signal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;
        const flip = at(sources, 0)[0]() % 3;
        for (let depIndex = 0; depIndex < depCount; depIndex++) {
          const sourceIndex = (memoIndex + depIndex + flip * 7) % sourceCount;
          sum += at(sources, sourceIndex)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    primeReads(memos);

    return { sources, memos };
  }

  function buildSolid() {
    const sources = Array.from({ length: sourceCount }, () => createSignal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      createMemo(() => {
        let sum = 0;
        const flip = at(sources, 0)[0]() % 3;
        for (let depIndex = 0; depIndex < depCount; depIndex++) {
          const sourceIndex = (memoIndex + depIndex + flip * 7) % sourceCount;
          sum += at(sources, sourceIndex)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    flush();
    primeReads(memos);

    return { sources, memos };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const rngOurs = createRng(0x601);
  const rngSolid = createRng(0x602);

  bench("beta build - flip deps every tick, read 100%", () => {
    at(ours.sources, 0)[1](rngOurs.int(1000));
    for (const read of ours.memos) {
      blackhole(read());
    }
  }, { iterations: 300, warmupIterations: 50 });

  bench("solid signals - flip deps every tick, flush, read 100%", () => {
    at(solid.sources, 0)[1](rngSolid.int(1000));
    flush();
    for (const read of solid.memos) {
      blackhole(read());
    }
  }, { iterations: 300, warmupIterations: 50 });
});

describe("Large batch write (20% sources) + full read", () => {
  const memoCount = 800;
  const sourceCount = 80;
  const batchSize = Math.floor(sourceCount * 0.2);

  function buildOurs() {
    const ours = createOursHarness();
    const sources = Array.from({ length: sourceCount }, () => ours.signal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      ours.memo(() => {
        let sum = 0;
        for (let depIndex = 0; depIndex < 6; depIndex++) {
          sum += at(sources, (memoIndex + depIndex) % sourceCount)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    primeReads(memos);

    const batchWrites: Array<[Signal<unknown>, unknown]> = Array.from(
      { length: batchSize },
      (_, index) => [at(sources, index)[2], 0],
    );

    return { memos, batchWrites, batchWrite: ours.batchWrite };
  }

  function buildSolid() {
    const sources = Array.from({ length: sourceCount }, () => createSignal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      createMemo(() => {
        let sum = 0;
        for (let depIndex = 0; depIndex < 6; depIndex++) {
          sum += at(sources, (memoIndex + depIndex) % sourceCount)[0]();
        }
        return sum;
      }),
    );

    for (const [, write] of sources) {
      write(0);
    }
    flush();
    primeReads(memos);

    return { sources, memos };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const rngOurs = createRng(0x701);
  const rngSolid = createRng(0x702);

  bench("beta build - batch 20% sources, read all", () => {
    for (let index = 0; index < ours.batchWrites.length; index++) {
      at(ours.batchWrites, index)[1] = rngOurs.next() * 100;
    }
    ours.batchWrite(ours.batchWrites as ReadonlyArray<BatchWriteEntry>);
    for (const read of ours.memos) {
      blackhole(read());
    }
  }, { iterations: 180, warmupIterations: 40 });

  bench("solid signals - batch 20% sources, flush, read all", () => {
    for (let index = 0; index < batchSize; index++) {
      at(solid.sources, index)[1](rngSolid.next() * 100);
    }
    flush();
    for (const read of solid.memos) {
      blackhole(read());
    }
  }, { iterations: 180, warmupIterations: 40 });
});

describe("Realistic UI: virtualized table 4000 rows x 6 cols", () => {
  const rows = 4000;
  const cols = 6;
  const visibleRows = 400;
  const changedPct = 0.02;

  function buildOurs() {
    const ours = createOursHarness();
    const rowSources = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, column) =>
        ours.signal(column === 0 ? 100 : 0),
      ),
    );

    const cells = Array.from({ length: rows }, (_, rowIndex) =>
      Array.from({ length: cols }, (_, columnIndex) =>
        ours.memo(() => {
          const base = at(at(rowSources, rowIndex), 0)[0]();
          if (columnIndex === 0) return base;
          return Math.round(
            base * (1 + columnIndex * 0.1) +
              at(at(rowSources, rowIndex), columnIndex)[0](),
          );
        }),
      ),
    );

    const rowSums = Array.from({ length: rows }, (_, rowIndex) =>
      ours.memo(() => {
        let sum = 0;
        for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
          sum += at(at(cells, rowIndex), columnIndex)();
        }
        return sum;
      }),
    );

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        at(at(rowSources, rowIndex), columnIndex)[1](
          columnIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0,
        );
      }
    }

    for (let pass = 0; pass < 4; pass++) {
      for (let rowIndex = 0; rowIndex < rows; rowIndex += 150) {
        blackhole(at(at(cells, rowIndex), 0)());
        blackhole(at(at(cells, rowIndex), 1)());
        blackhole(at(at(cells, rowIndex), 2)());
        blackhole(at(at(cells, rowIndex), 3)());
        blackhole(at(rowSums, rowIndex)());
      }
    }

    return { rowSources, cells, rowSums };
  }

  function buildSolid() {
    const rowSources = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, column) =>
        createSignal(column === 0 ? 100 : 0),
      ),
    );

    const cells = Array.from({ length: rows }, (_, rowIndex) =>
      Array.from({ length: cols }, (_, columnIndex) =>
        createMemo(() => {
          const base = at(at(rowSources, rowIndex), 0)[0]();
          if (columnIndex === 0) return base;
          return Math.round(
            base * (1 + columnIndex * 0.1) +
              at(at(rowSources, rowIndex), columnIndex)[0](),
          );
        }),
      ),
    );

    const rowSums = Array.from({ length: rows }, (_, rowIndex) =>
      createMemo(() => {
        let sum = 0;
        for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
          sum += at(at(cells, rowIndex), columnIndex)();
        }
        return sum;
      }),
    );

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        at(at(rowSources, rowIndex), columnIndex)[1](
          columnIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0,
        );
      }
    }
    flush();

    for (let pass = 0; pass < 4; pass++) {
      for (let rowIndex = 0; rowIndex < rows; rowIndex += 150) {
        blackhole(at(at(cells, rowIndex), 0)());
        blackhole(at(at(cells, rowIndex), 1)());
        blackhole(at(at(cells, rowIndex), 2)());
        blackhole(at(at(cells, rowIndex), 3)());
        blackhole(at(rowSums, rowIndex)());
      }
    }

    return { rowSources, cells, rowSums };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const rngOursPartial = createRng(0x801);
  const rngSolidPartial = createRng(0x802);
  const rngOursLive = createRng(0x803);
  const rngSolidLive = createRng(0x804);

  bench("beta build - partial update ~2% rows, render 400 visible", () => {
    const changedCount = Math.floor(rows * changedPct);
    const changedRows = new Set<number>();
    while (changedRows.size < changedCount) {
      changedRows.add(rngOursPartial.int(rows));
    }

    for (const rowIndex of changedRows) {
      const baseSignal = at(at(ours.rowSources, rowIndex), 0);
      const current = baseSignal[0]();
      baseSignal[1](current + rngOursPartial.centered(25));
    }

    const start = rngOursPartial.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(at(ours.rowSums, rowIndex)());
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        blackhole(at(at(ours.cells, rowIndex), columnIndex)());
      }
    }
  }, { iterations: 80, warmupIterations: 20 });

  bench("solid signals - partial update ~2% rows, flush, render 400 visible", () => {
    const changedCount = Math.floor(rows * changedPct);
    const changedRows = new Set<number>();
    while (changedRows.size < changedCount) {
      changedRows.add(rngSolidPartial.int(rows));
    }

    for (const rowIndex of changedRows) {
      const baseSignal = at(at(solid.rowSources, rowIndex), 0);
      const current = baseSignal[0]();
      baseSignal[1](current + rngSolidPartial.centered(25));
    }

    flush();

    const start = rngSolidPartial.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(at(solid.rowSums, rowIndex)());
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        blackhole(at(at(solid.cells, rowIndex), columnIndex)());
      }
    }
  }, { iterations: 80, warmupIterations: 20 });

  bench("beta build - live column 2 update all rows, render 400 visible", () => {
    const delta = rngOursLive.centered(5);
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const signal = at(at(ours.rowSources, rowIndex), 2);
      signal[1](signal[0]() + delta);
    }

    const start = rngOursLive.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(at(at(ours.cells, rowIndex), 2)());
      blackhole(at(ours.rowSums, rowIndex)());
    }
  }, { iterations: 100, warmupIterations: 30 });

  bench("solid signals - live column 2 update all rows, flush, render 400 visible", () => {
    const delta = rngSolidLive.centered(5);
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const signal = at(at(solid.rowSources, rowIndex), 2);
      signal[1](signal[0]() + delta);
    }

    flush();

    const start = rngSolidLive.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(at(at(solid.cells, rowIndex), 2)());
      blackhole(at(solid.rowSums, rowIndex)());
    }
  }, { iterations: 100, warmupIterations: 30 });
});
