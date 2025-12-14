import { bench, describe } from "vitest";
import { Uint64Array as ReflexU64 } from  "../../src/storage/storage.structure";

const N = 1_000_000;

// helper for ns/op
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return ((end - start) * 1e6) / N; // ns/op
}

describe("Uint64Array — precise per-operation benchmarks", () => {

  bench("write() — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();

    // warmup
    for (let i = 0; i < 1000; i++) S.write(id, i, i);

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        S.write(id, i, i * 7);
      }
    });

    console.log(`write(): ${ns.toFixed(2)} ns/op`);
  });

  bench("rawHi/rawLo read — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();
    S.write(id, 123, 456);

    let sink = 0;

    // warmup
    for (let i = 0; i < 1000; i++) {
      sink ^= S.rawLo(id);
    }

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        sink ^= S.rawHi(id);
        sink ^= S.rawLo(id);
      }
    });

    if (sink === -1) throw new Error();
    console.log(`rawHi/rawLo: ${ns.toFixed(2)} ns/op`);
  });

  bench("readBigInt — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();
    S.write(id, 0x11223344, 0xaabbccd0);

    let sink = 0n;

    // warmup
    for (let i = 0; i < 1000; i++) sink ^= S.readBigInt(id);

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        sink ^= S.readBigInt(id);
      }
    });

    if (sink === -1n) throw new Error();
    console.log(`readBigInt(): ${ns.toFixed(2)} ns/op`);
  });

  bench("writeBigInt — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();

    let v = 0n;

    // warmup
    for (let i = 0; i < 1000; i++) S.writeBigInt(id, 123n);

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        S.writeBigInt(id, v);
        v = (v + 1n) & ((1n << 64n) - 1n);
      }
    });

    console.log(`writeBigInt(): ${ns.toFixed(2)} ns/op`);
  });

  bench("readNumber — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();
    S.write(id, 10, 20);

    let sink = 0;

    // warmup
    for (let i = 0; i < 1000; i++) sink ^= S.readNumber(id);

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        sink ^= S.readNumber(id);
      }
    });

    if (sink === -1) throw new Error();
    console.log(`readNumber(): ${ns.toFixed(2)} ns/op`);
  });

  bench("writeNumber — ns/op", () => {
    const S = new ReflexU64(1);
    const id = S.create();

    let x = 0;

    // warmup
    for (let i = 0; i < 1000; i++) S.writeNumber(id, 123);

    const ns = measure(() => {
      for (let i = 0; i < N; i++) {
        S.writeNumber(id, x++);
      }
    });

    console.log(`writeNumber(): ${ns.toFixed(2)} ns/op`);
  });

});
