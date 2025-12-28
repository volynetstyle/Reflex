import {
  GenerationalArena,
  packHandle,
  unpackHandle,
} from "../../src/graph/graph.arena";
import { bench, describe } from "vitest";

const N = 1000;

describe("GenerationalArena benchmarks " + N, () => {
  bench("insert N items Array", () => {
    const arena = new Array<number>(N);

    for (let i = 0; i < N; i++) {
      arena.push(i);
    }
  });

  bench("insert N items", () => {
    const arena = new GenerationalArena<number>(N);

    for (let i = 0; i < N; i++) {
      arena.insert(i);
    }
  });

  bench("insert + get (hot path)", () => {
    const arena = new GenerationalArena<number>(N);
    const handles: [number, number][] = new Array(N);

    for (let i = 0; i < N; i++) {
      handles[i] = arena.insert(i);
    }

    let sum = 0;
    for (let i = 0; i < N; i++) {
      const [idx, gen] = handles[i]!;
      const v = arena.get(idx, gen);
      if (v !== undefined) sum += v;
    }

    // prevent DCE
    if (sum === -1) console.log(sum);
  });

  bench("remove all (ABA safety)", () => {
    const arena = new GenerationalArena<number>(N);
    const handles: [number, number][] = new Array(N);

    for (let i = 0; i < N; i++) {
      handles[i] = arena.insert(i);
    }

    for (let i = 0; i < N; i++) {
      const [idx, gen] = handles[i]!;
      arena.remove(idx, gen);
    }
  });

  bench("reuse slots (free list)", () => {
    const arena = new GenerationalArena<number>(N);
    const handles: [number, number][] = new Array(N);

    for (let i = 0; i < N; i++) {
      handles[i] = arena.insert(i);
    }

    for (let i = 0; i < N; i++) {
      const [idx, gen] = handles[i]!;
      arena.remove(idx, gen);
    }

    for (let i = 0; i < N; i++) {
      arena.insert(i);
    }
  });

  bench("isValid hot loop", () => {
    const arena = new GenerationalArena<number>(N);
    const handles: [number, number][] = new Array(N);

    for (let i = 0; i < N; i++) {
      handles[i] = arena.insert(i);
    }

    let ok = 0;
    for (let i = 0; i < N; i++) {
      const [idx, gen] = handles[i]!;
      if (arena.isValid(idx, gen)) ok++;
    }

    if (ok === -1) console.log(ok);
  });

  bench("iteration (valuesIter)", () => {
    const arena = new GenerationalArena<number>(N);

    for (let i = 0; i < N; i++) {
      arena.insert(i);
    }

    let sum = 0;
    for (const v of arena.valuesIter()) {
      sum += v;
    }

    if (sum === -1) console.log(sum);
  });

  bench("iteration (entries)", () => {
    const arena = new GenerationalArena<number>(N);

    for (let i = 0; i < N; i++) {
      arena.insert(i);
    }

    let sum = 0;
    for (const [i, g, v] of arena.entries()) {
      sum += v + i + g;
    }

    if (sum === -1) console.log(sum);
  });

  bench("BigInt pack/unpack handle", () => {
    let acc = 0n;

    for (let i = 0; i < N; i++) {
      const h = packHandle(i, i + 1);
      const [idx, gen] = unpackHandle(h);
      acc += BigInt(idx + gen);
    }

    if (acc === -1n) console.log(acc);
  });
});
