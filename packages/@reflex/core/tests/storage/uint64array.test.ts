import { describe, it, expect } from "vitest";
import { Uint64Array } from "../../src/storage/storage.structure";

describe("Uint64Array — core semantics", () => {
  it("creates empty storage with correct capacity", () => {
    const S = new Uint64Array(4);
    expect(S.size).toBe(0);
    expect(S.capacity).toBe(4);
    expect(S.memoryUsage).toBe(4 * 2 * 4);
  });

  it("allocates IDs sequentially", () => {
    const S = new Uint64Array(2);
    const id0 = S.create();
    const id1 = S.create();
    expect(id0).toBe(0);
    expect(id1).toBe(1);
    expect(S.size).toBe(2);
  });

  it("grows capacity automatically", () => {
    const S = new Uint64Array(1);
    S.create(); // ok
    expect(S.capacity).toBe(1);

    S.create(); // triggers grow: 1 -> 2
    expect(S.capacity).toBe(2);
  });

  it("write()/readBigInt() works correctly", () => {
    const S = new Uint64Array(8);
    const id = S.create();

    const value = 1234567890123456789n & ((1n << 64n) - 1n);
    S.writeBigInt(id, value);

    const out = S.readBigInt(id);
    expect(out).toBe(value);
  });

  it("writeNumber()/readNumber() matches for safe integers", () => {
    const S = new Uint64Array(8);
    const id = S.create();
    const value = Number.MAX_SAFE_INTEGER; // 2^53 - 1

    S.writeNumber(id, value);
    expect(S.readNumber(id)).toBe(value);
  });

  it("rawHi/rawLo/setHi/setLo are correct", () => {
    const S = new Uint64Array(8);
    const id = S.create();

    S.setHi(id, 0xdeadbeef);
    S.setLo(id, 0xcafebabe);

    expect(S.rawHi(id)).toBe(0xdeadbeef >>> 0);
    expect(S.rawLo(id)).toBe(0xcafebabe >>> 0);
  });

  it("write() stores correct hi/lo", () => {
    const S = new Uint64Array(4);
    const id = S.create();
    S.write(id, 0x11223344, 0xaabbccdd);

    expect(S.rawHi(id)).toBe(0x11223344);
    expect(S.rawLo(id)).toBe(0xaabbccdd);
  });

  it("copyFrom() copies ranges", () => {
    const A = new Uint64Array(8);
    const B = new Uint64Array(8);

    const a0 = A.create();
    const a1 = A.create();
    A.write(a0, 1, 2);
    A.write(a1, 3, 4);

    B.copyFrom(A, 0, 0, 2);

    expect(B.readBigInt(0)).toBe(A.readBigInt(0));
    expect(B.readBigInt(1)).toBe(A.readBigInt(1));
    expect(B.size).toBe(2);
  });

  it("fill() works", () => {
    const S = new Uint64Array(8);
    S.create();
    S.create();
    S.create();

    S.fill(0xaaaa, 0xbbbb);

    expect(S.rawHi(0)).toBe(0xaaaa);
    expect(S.rawHi(1)).toBe(0xaaaa);
    expect(S.rawHi(2)).toBe(0xaaaa);
    expect(S.rawLo(0)).toBe(0xbbbb);
  });

  it("subarray() returns correct view", () => {
    const S = new Uint64Array(8);
    S.create();
    S.create();
    S.write(0, 1, 2);
    S.write(1, 3, 4);

    const view = S.subarray(0, 2);
    expect(view.length).toBe(4); // hi0, lo0, hi1, lo1
    expect(view[0]).toBe(1);
    expect(view[1]).toBe(2);
  });

  it("clear() resets size but preserves memory", () => {
    const S = new Uint64Array(4);
    S.create();
    S.create();
    expect(S.size).toBe(2);

    const oldMem = S.memoryUsage;
    S.clear();
    expect(S.size).toBe(0);
    expect(S.memoryUsage).toBe(oldMem);
  });
});
