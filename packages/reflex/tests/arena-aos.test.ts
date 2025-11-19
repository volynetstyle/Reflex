/**
 * Тест AoS Arena
 */
import { describe, it, expect, beforeEach } from "vitest";
import { arena, NULL } from "../src/core/graph/memory/graph.arena";

describe("GraphArenaAoS", () => {
  beforeEach(() => {
    // Кожен тест починається з чистої арени
    // У насправді, ми просто очищуємо freelist через alloc/free цикли
  });

  it("should allocate and free nodes", () => {
    const id1 = arena.alloc();
    const id2 = arena.alloc();

    expect(typeof id1).toBe("number");
    expect(typeof id2).toBe("number");
    expect(id1).not.toBe(id2);

    arena.free(id1);
    const id3 = arena.alloc();

    // Повинен переалокуватися id1
    expect(id3).toBe(id1);
  });

  it("should write and read u32 fields", () => {
    const id = arena.alloc();

    arena.setNextSource(id, 42);
    expect(arena.getNextSource(id)).toBe(42);

    arena.setPrevSource(id, 100);
    expect(arena.getPrevSource(id)).toBe(100);

    arena.setFirstObserver(id, 999);
    expect(arena.getFirstObserver(id)).toBe(999);
  });

  it("should write and read u16 fields", () => {
    const id = arena.alloc();

    arena.setSourceCount(id, 5);
    expect(arena.getSourceCount(id)).toBe(5);

    arena.setObserverCount(id, 10);
    expect(arena.getObserverCount(id)).toBe(10);
  });

  it("should write and read u8 fields", () => {
    const id = arena.alloc();

    arena.setKind(id, 0); // source
    expect(arena.getKind(id)).toBe(0);

    arena.setKind(id, 1); // computation
    expect(arena.getKind(id)).toBe(1);

    arena.setKind(id, 2); // effect
    expect(arena.getKind(id)).toBe(2);
  });

  it("should handle external storage for non-typed values", () => {
    const id = arena.alloc();

    const testValue = { foo: "bar" };
    arena.setValueRaw(id, testValue);
    expect(arena.getValueRaw(id)).toBe(testValue);

    const testFn = () => console.log("test");
    arena.setObserverFn(id, testFn);
    expect(arena.getObserverFn(id)).toBe(testFn);
  });

  it("should respect NULL sentinel", () => {
    const id = arena.alloc();

    // Ініціалізація — все повинно бути 0xff (старший байт NULL)
    arena.setNextSource(id, NULL);
    expect(arena.getNextSource(id)).toBe(NULL);
  });

  it("should handle multiple nodes independently", () => {
    const id1 = arena.alloc();
    const id2 = arena.alloc();

    arena.setNextSource(id1, 111);
    arena.setNextSource(id2, 222);

    expect(arena.getNextSource(id1)).toBe(111);
    expect(arena.getNextSource(id2)).toBe(222);

    arena.setSourceCount(id1, 1);
    arena.setSourceCount(id2, 2);

    expect(arena.getSourceCount(id1)).toBe(1);
    expect(arena.getSourceCount(id2)).toBe(2);
  });

  it("should grow buffer when needed", () => {
    const ids: number[] = [];

    // Алокуємо багато нодів
    for (let i = 0; i < 2000; i++) {
      ids.push(arena.alloc());
    }

    // Перевіряємо, що всі нормально доступні
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      arena.setNextSource(id, i);
      expect(arena.getNextSource(id)).toBe(i);
    }
  });
});
