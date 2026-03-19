import { bench, describe } from "vitest";
import { createMemo, createSignal, flush } from "@solidjs/signals";
import {
  computed as createAlienComputed,
  signal as createAlienSignal,
} from "alien-signals";
import { createRuntime, type BatchWriteEntry, type Signal } from "../";

type Read<T> = () => T;
type Write<T> = (value: T) => void;
type SignalPair<T> = readonly [Read<T>, Write<T>];
type OursSignal<T> = readonly [Read<T>, Write<T>, Signal<T>];
type SolidSignal<T> = readonly [Read<T>, Write<T>];
type AlienSignal<T> = readonly [Read<T>, Write<T>];

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

function createUniqueIndexSampler(maxExclusive: number) {
  const marks = new Uint32Array(maxExclusive);
  let epoch = 0;

  return (
    count: number,
    rng: ReturnType<typeof createRng>,
    output: number[],
  ): readonly number[] => {
    ++epoch;
    if (epoch === 0) {
      marks.fill(0);
      epoch = 1;
    }

    output.length = 0;

    while (output.length < count) {
      const index = rng.int(maxExclusive);
      if (marks[index] === epoch) continue;
      marks[index] = epoch;
      output.push(index);
    }

    return output;
  };
}

function updateRowBases(
  rowSources: readonly (readonly SignalPair<number>[])[],
  changedRows: readonly number[],
  rng: ReturnType<typeof createRng>,
): void {
  for (let index = 0; index < changedRows.length; index++) {
    const rowIndex = changedRows[index]!;
    const baseSignal = rowSources[rowIndex]![0]!;
    const current = baseSignal[0]();
    baseSignal[1](current + rng.centered(25));
  }
}

function renderVisibleRows(
  cells: readonly (readonly Read<number>[])[],
  rowSums: readonly Read<number>[],
  start: number,
  visibleRows: number,
  cols: number,
): void {
  for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
    blackhole(rowSums[rowIndex]!());
    const cellRow = cells[rowIndex]!;
    for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
      blackhole(cellRow[columnIndex]!());
    }
  }
}

function primeTableSample(
  cells: readonly (readonly Read<number>[])[],
  rowSums: readonly Read<number>[],
  rowStep: number,
): void {
  for (let pass = 0; pass < 4; pass++) {
    for (let rowIndex = 0; rowIndex < cells.length; rowIndex += rowStep) {
      const cellRow = cells[rowIndex]!;
      blackhole(cellRow[0]!());
      blackhole(cellRow[1]!());
      blackhole(cellRow[2]!());
      blackhole(cellRow[3]!());
      blackhole(rowSums[rowIndex]!());
    }
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

function createAlienHarness() {
  return {
    signal<T>(initial: T): AlienSignal<T> {
      const signal = createAlienSignal(initial);
      return [() => signal(), (value: T) => signal(value)];
    },
    memo<T>(compute: () => T): Read<T> {
      const memo = createAlienComputed(compute);
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

  function buildAlien(sourceCount: number) {
    const alien = createAlienHarness();
    const sources = Array.from({ length: sourceCount }, () => alien.signal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      alien.memo(() => {
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

  const ours2 = buildOurs(2);
  const solid2 = buildSolid(2);
  const alien2 = buildAlien(2);
  const ours25 = buildOurs(25);
  const solid25 = buildSolid(25);
  const alien25 = buildAlien(25);
  const rngOurs2 = createRng(0x201);
  const rngSolid2 = createRng(0x202);
  const rngAlien2 = createRng(0x203);
  const rngOurs25 = createRng(0x251);
  const rngSolid25 = createRng(0x252);
  const rngAlien25 = createRng(0x253);

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

  bench("alien-signals - 2 sources, change 1, read ~10%", () => {
    at(alien2.sources, rngAlien2.int(2))[1](rngAlien2.next() * 1000);
    for (let index = 0; index < memoCount; index += readEvery10) {
      blackhole(at(alien2.memos, index)());
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

  bench("alien-signals - 25 sources, change 1, read ~10%", () => {
    at(alien25.sources, rngAlien25.int(25))[1](rngAlien25.next() * 1000);
    for (let index = 0; index < memoCount; index += readEvery9) {
      blackhole(at(alien25.memos, index)());
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

  function buildAlien() {
    const alien = createAlienHarness();
    const sources = Array.from({ length: sourceCount }, () => alien.signal(0));
    const ends: Array<Read<number>> = [];

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex++) {
      let prev = at(sources, chainIndex % sourceCount)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = alien.memo(() => readPrev());
      }
      ends.push(prev);
    }

    for (const [, write] of sources) {
      write(0);
    }
    primeReads(ends);

    return { sources, ends };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const alien = buildAlien();
  const rngOurs = createRng(0x401);
  const rngSolid = createRng(0x402);
  const rngAlien = createRng(0x403);

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

  bench("alien-signals - change 1 source, read 8 ends", () => {
    at(alien.sources, 1)[1](rngAlien.next() * 200);
    for (const read of alien.ends) {
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

  function buildAlien() {
    const alien = createAlienHarness();
    const sources = Array.from({ length: pathCount }, () => alien.signal(0));
    const pathEnds: Array<Read<number>> = [];

    for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
      let prev = at(sources, pathIndex)[0];
      for (let level = 0; level < depth; level++) {
        const readPrev = prev;
        prev = alien.memo(() => readPrev() * 1.0001 + level);
      }
      pathEnds.push(prev);
    }

    const final = alien.memo(() => {
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

  const ours = buildOurs();
  const solid = buildSolid();
  const alien = buildAlien();
  const rngOurs = createRng(0x501);
  const rngSolid = createRng(0x502);
  const rngAlien = createRng(0x503);

  bench("beta build - change 1 source, read final", () => {
    at(ours.sources, rngOurs.int(pathCount))[1](rngOurs.next() * 100);
    blackhole(ours.final());
  }, { iterations: 800, warmupIterations: 100 });

  bench("solid signals - change 1 source, flush, read final", () => {
    at(solid.sources, rngSolid.int(pathCount))[1](rngSolid.next() * 100);
    flush();
    blackhole(solid.final());
  }, { iterations: 800, warmupIterations: 100 });

  bench("alien-signals - change 1 source, read final", () => {
    at(alien.sources, rngAlien.int(pathCount))[1](rngAlien.next() * 100);
    blackhole(alien.final());
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

  function buildAlien() {
    const alien = createAlienHarness();
    const sources = Array.from({ length: sourceCount }, () => alien.signal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      alien.memo(() => {
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

  const ours = buildOurs();
  const solid = buildSolid();
  const alien = buildAlien();
  const rngOurs = createRng(0x601);
  const rngSolid = createRng(0x602);
  const rngAlien = createRng(0x603);

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

  bench("alien-signals - flip deps every tick, read 100%", () => {
    at(alien.sources, 0)[1](rngAlien.int(1000));
    for (const read of alien.memos) {
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

  function buildAlien() {
    const alien = createAlienHarness();
    const sources = Array.from({ length: sourceCount }, () => alien.signal(0));
    const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
      alien.memo(() => {
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

    return { sources, memos };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const alien = buildAlien();
  const rngOurs = createRng(0x701);
  const rngSolid = createRng(0x702);
  const rngAlien = createRng(0x703);

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
      solid.sources[index]![1](rngSolid.next() * 100);
    }
    flush();
    for (const read of solid.memos) {
      blackhole(read());
    }
  }, { iterations: 180, warmupIterations: 40 });

  bench("alien-signals - write 20% sources, read all", () => {
    for (let index = 0; index < batchSize; index++) {
      alien.sources[index]![1](rngAlien.next() * 100);
    }
    for (const read of alien.memos) {
      blackhole(read());
    }
  }, { iterations: 180, warmupIterations: 40 });
});

describe("Realistic UI: virtualized table 4000 rows x 6 cols", () => {
  const rows = 4000;
  const cols = 6;
  const visibleRows = 400;
  const changedPct = 0.02;
  const changedCount = Math.floor(rows * changedPct);

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
          const row = rowSources[rowIndex]!;
          const base = row[0]![0]();
          if (columnIndex === 0) return base;
          return Math.round(
            base * (1 + columnIndex * 0.1) +
              row[columnIndex]![0](),
          );
        }),
      ),
    );

    const rowSums = Array.from({ length: rows }, (_, rowIndex) =>
      ours.memo(() => {
        let sum = 0;
        const row = cells[rowIndex]!;
        for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
          sum += row[columnIndex]!();
        }
        return sum;
      }),
    );

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const row = rowSources[rowIndex]!;
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        row[columnIndex]![1](
          columnIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0,
        );
      }
    }

    primeTableSample(cells, rowSums, 150);

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
          const row = rowSources[rowIndex]!;
          const base = row[0]![0]();
          if (columnIndex === 0) return base;
          return Math.round(
            base * (1 + columnIndex * 0.1) +
              row[columnIndex]![0](),
          );
        }),
      ),
    );

    const rowSums = Array.from({ length: rows }, (_, rowIndex) =>
      createMemo(() => {
        let sum = 0;
        const row = cells[rowIndex]!;
        for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
          sum += row[columnIndex]!();
        }
        return sum;
      }),
    );

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const row = rowSources[rowIndex]!;
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        row[columnIndex]![1](
          columnIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0,
        );
      }
    }
    flush();

    primeTableSample(cells, rowSums, 150);

    return { rowSources, cells, rowSums };
  }

  function buildAlien() {
    const alien = createAlienHarness();
    const rowSources = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, column) =>
        alien.signal(column === 0 ? 100 : 0),
      ),
    );

    const cells = Array.from({ length: rows }, (_, rowIndex) =>
      Array.from({ length: cols }, (_, columnIndex) =>
        alien.memo(() => {
          const row = rowSources[rowIndex]!;
          const base = row[0]![0]();
          if (columnIndex === 0) return base;
          return Math.round(
            base * (1 + columnIndex * 0.1) +
              row[columnIndex]![0](),
          );
        }),
      ),
    );

    const rowSums = Array.from({ length: rows }, (_, rowIndex) =>
      alien.memo(() => {
        let sum = 0;
        const row = cells[rowIndex]!;
        for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
          sum += row[columnIndex]!();
        }
        return sum;
      }),
    );

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const row = rowSources[rowIndex]!;
      for (let columnIndex = 0; columnIndex < cols; columnIndex++) {
        row[columnIndex]![1](
          columnIndex === 0 ? 100 + ((rowIndex * 17 + 13) % 900) : 0,
        );
      }
    }

    primeTableSample(cells, rowSums, 150);

    return { rowSources, cells, rowSums };
  }

  const ours = buildOurs();
  const solid = buildSolid();
  const alien = buildAlien();
  const rngOursPartial = createRng(0x801);
  const rngSolidPartial = createRng(0x802);
  const rngAlienPartial = createRng(0x803);
  const rngOursLive = createRng(0x803);
  const rngSolidLive = createRng(0x804);
  const rngAlienLive = createRng(0x805);
  const sampleOursChangedRows = createUniqueIndexSampler(rows);
  const sampleSolidChangedRows = createUniqueIndexSampler(rows);
  const sampleAlienChangedRows = createUniqueIndexSampler(rows);
  const oursChangedRows: number[] = [];
  const solidChangedRows: number[] = [];
  const alienChangedRows: number[] = [];

  bench("beta build - partial update ~2% rows, render 400 visible", () => {
    updateRowBases(
      ours.rowSources,
      sampleOursChangedRows(changedCount, rngOursPartial, oursChangedRows),
      rngOursPartial,
    );

    const start = rngOursPartial.int(rows - visibleRows);
    renderVisibleRows(ours.cells, ours.rowSums, start, visibleRows, cols);
  }, { iterations: 80, warmupIterations: 20 });

  bench("solid signals - partial update ~2% rows, flush, render 400 visible", () => {
    updateRowBases(
      solid.rowSources,
      sampleSolidChangedRows(changedCount, rngSolidPartial, solidChangedRows),
      rngSolidPartial,
    );

    flush();

    const start = rngSolidPartial.int(rows - visibleRows);
    renderVisibleRows(solid.cells, solid.rowSums, start, visibleRows, cols);
  }, { iterations: 80, warmupIterations: 20 });

  bench("alien-signals - partial update ~2% rows, render 400 visible", () => {
    updateRowBases(
      alien.rowSources,
      sampleAlienChangedRows(changedCount, rngAlienPartial, alienChangedRows),
      rngAlienPartial,
    );

    const start = rngAlienPartial.int(rows - visibleRows);
    renderVisibleRows(alien.cells, alien.rowSums, start, visibleRows, cols);
  }, { iterations: 80, warmupIterations: 20 });

  bench("beta build - live column 2 update all rows, render 400 visible", () => {
    const delta = rngOursLive.centered(5);
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const signal = ours.rowSources[rowIndex]![2]!;
      signal[1](signal[0]() + delta);
    }

    const start = rngOursLive.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(ours.cells[rowIndex]![2]!());
      blackhole(ours.rowSums[rowIndex]!());
    }
  }, { iterations: 100, warmupIterations: 30 });

  bench("solid signals - live column 2 update all rows, flush, render 400 visible", () => {
    const delta = rngSolidLive.centered(5);
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const signal = solid.rowSources[rowIndex]![2]!;
      signal[1](signal[0]() + delta);
    }

    flush();

    const start = rngSolidLive.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(solid.cells[rowIndex]![2]!());
      blackhole(solid.rowSums[rowIndex]!());
    }
  }, { iterations: 100, warmupIterations: 30 });

  bench("alien-signals - live column 2 update all rows, render 400 visible", () => {
    const delta = rngAlienLive.centered(5);
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      const signal = alien.rowSources[rowIndex]![2]!;
      signal[1](signal[0]() + delta);
    }

    const start = rngAlienLive.int(rows - visibleRows);
    for (let rowIndex = start; rowIndex < start + visibleRows; rowIndex++) {
      blackhole(alien.cells[rowIndex]![2]!());
      blackhole(alien.rowSums[rowIndex]!());
    }
  }, { iterations: 100, warmupIterations: 30 });
});
