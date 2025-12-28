import { describe, it, expect } from "vitest";
import { GenerationalArena } from "../../src/graph/graph.arena";

describe("GenerationalArena", () => {
  describe("Basic Operations", () => {
    it("should insert and retrieve a value", () => {
      const arena = new GenerationalArena<string>();
      const [idx, gen] = arena.insert("hello");

      expect(arena.get(idx, gen)).toBe("hello");
      expect(arena.length).toBe(1);
    });

    it("should handle multiple insertions", () => {
      const arena = new GenerationalArena<number>();
      const handles = [arena.insert(10), arena.insert(20), arena.insert(30)];

      expect(arena.length).toBe(3);
      expect(arena.get(...handles[0])).toBe(10);
      expect(arena.get(...handles[1])).toBe(20);
      expect(arena.get(...handles[2])).toBe(30);
    });

    it("should insert with initial capacity", () => {
      const arena = new GenerationalArena<string>(4);
      const handles = [];

      for (let i = 0; i < 4; i++) {
        handles.push(arena.insert(`item-${i}`));
      }

      expect(arena.length).toBe(4);
      handles.forEach(([idx, gen], i) => {
        expect(arena.get(idx, gen)).toBe(`item-${i}`);
      });
    });
  });

  describe("Removal and Reuse", () => {
    it("should remove a value and return it", () => {
      const arena = new GenerationalArena<string>();
      const [idx, gen] = arena.insert("test");

      const removed = arena.remove(idx, gen);

      expect(removed).toBe("test");
      expect(arena.length).toBe(0);
      expect(arena.get(idx, gen)).toBeUndefined();
    });

    it("should reuse slots after removal", () => {
      const arena = new GenerationalArena<string>();
      const [idx1, gen1] = arena.insert("first");

      arena.remove(idx1, gen1);
      const [idx2, gen2] = arena.insert("second");

      expect(idx2).toBe(idx1);
      expect(gen2).not.toBe(gen1);
      expect(arena.get(idx2, gen2)).toBe("second");
      expect(arena.length).toBe(1);
    });

    it("should handle multiple removals and reuses", () => {
      const arena = new GenerationalArena<number>();
      const handles = [
        arena.insert(1),
        arena.insert(2),
        arena.insert(3),
        arena.insert(4),
        arena.insert(5),
      ];

      // Remove items at indices 1, 3
      arena.remove(...handles[1]);
      arena.remove(...handles[3]);

      expect(arena.length).toBe(3);

      // Insert new items - should reuse slots
      const [newIdx1] = arena.insert(10);
      const [newIdx2] = arena.insert(20);

      expect([newIdx1, newIdx2].sort()).toEqual(
        [handles[1][0], handles[3][0]].sort(),
      );
      expect(arena.length).toBe(5);
    });
  });

  describe("Generation Validation (ABA Problem)", () => {
    it("should invalidate old generations after removal", () => {
      const arena = new GenerationalArena<number>();
      const [idx, gen] = arena.insert(100);

      arena.remove(idx, gen);
      arena.insert(200); // Reuses same index

      expect(arena.get(idx, gen)).toBeUndefined();
      expect(arena.isValid(idx, gen)).toBe(false);
    });

    it("should increment generation on each reuse", () => {
      const arena = new GenerationalArena<string>();
      const generations: number[] = [];

      for (let i = 0; i < 5; i++) {
        const [idx, gen] = arena.insert(`value-${i}`);
        generations.push(gen);
        arena.remove(idx, gen);
      }

      // All generations should be different
      const uniqueGens = new Set(generations);
      expect(uniqueGens.size).toBe(generations.length);

      // Generations should increment
      for (let i = 1; i < generations.length; i++) {
        expect(generations[i]).toBeGreaterThan(generations[i - 1]);
      }
    });

    it("should prevent access with wrong generation", () => {
      const arena = new GenerationalArena<number>();
      const [idx, gen] = arena.insert(42);

      expect(arena.get(idx, gen + 1)).toBeUndefined();
      expect(arena.get(idx, gen - 1)).toBeUndefined();
      expect(arena.isValid(idx, gen + 1)).toBe(false);
    });
  });

  describe("Capacity Management", () => {
    it("should expand capacity automatically", () => {
      const arena = new GenerationalArena<number>(4);
      const handles = [];

      for (let i = 0; i < 20; i++) {
        handles.push(arena.insert(i));
      }

      expect(arena.length).toBe(20);
      handles.forEach(([idx, gen], i) => {
        expect(arena.get(idx, gen)).toBe(i);
      });
    });

    it("should maintain data integrity after expansion", () => {
      const arena = new GenerationalArena<string>(2);

      const h1 = arena.insert("a");
      const h2 = arena.insert("b");
      const h3 = arena.insert("c"); // Triggers expansion
      const h4 = arena.insert("d");

      expect(arena.get(...h1)).toBe("a");
      expect(arena.get(...h2)).toBe("b");
      expect(arena.get(...h3)).toBe("c");
      expect(arena.get(...h4)).toBe("d");
    });
  });

  describe("Iteration", () => {
    it("should iterate over all values", () => {
      const arena = new GenerationalArena<number>();
      const values = [10, 20, 30, 40, 50];

      values.forEach((v) => arena.insert(v));

      const iterated = Array.from(arena.valuesIter());
      expect(iterated).toEqual(values);
    });

    it("should skip removed items during iteration", () => {
      const arena = new GenerationalArena<number>();
      const h1 = arena.insert(1);
      const h2 = arena.insert(2);
      const h3 = arena.insert(3);
      const h4 = arena.insert(4);

      arena.remove(...h2);
      arena.remove(...h4);

      const iterated = Array.from(arena.valuesIter());
      expect(iterated).toEqual([1, 3]);
    });

    it("should iterate with entries including indices and generations", () => {
      const arena = new GenerationalArena<string>();
      arena.insert("a");
      arena.insert("b");
      arena.insert("c");

      const entries = Array.from(arena.entries());

      expect(entries.length).toBe(3);
      entries.forEach(([idx, gen, value]) => {
        expect(typeof idx).toBe("number");
        expect(typeof gen).toBe("number");
        expect(typeof value).toBe("string");
      });
    });

    it("should handle iteration on empty arena", () => {
      const arena = new GenerationalArena<number>();

      const values = Array.from(arena.valuesIter());
      const entries = Array.from(arena.entries());

      expect(values).toEqual([]);
      expect(entries).toEqual([]);
    });
  });

  describe("Clear Operation", () => {
    it("should clear all values", () => {
      const arena = new GenerationalArena<string>();
      arena.insert("a");
      arena.insert("b");
      arena.insert("c");

      arena.clear();

      expect(arena.length).toBe(0);
      expect(Array.from(arena.valuesIter())).toEqual([]);
    });

    it("should reset state after clear", () => {
      const arena = new GenerationalArena<number>();
      const [idx1, gen1] = arena.insert(10);

      arena.clear();

      const [idx2, gen2] = arena.insert(20);

      expect(idx2).toBe(0);
      expect(gen2).toBe(1);
      expect(arena.get(idx1, gen1)).toBeUndefined();
    });

    it("should allow reuse after clear", () => {
      const arena = new GenerationalArena<string>();

      for (let i = 0; i < 100; i++) {
        arena.insert(`item-${i}`);
      }

      arena.clear();

      const [idx, gen] = arena.insert("new");
      expect(arena.get(idx, gen)).toBe("new");
      expect(arena.length).toBe(1);
    });
  });

  describe("Invalid Operations", () => {
    it("should return undefined for invalid index", () => {
      const arena = new GenerationalArena<number>();

      expect(arena.get(999, 1)).toBeUndefined();
      expect(arena.remove(999, 1)).toBeUndefined();
    });

    it("should return undefined for negative index", () => {
      const arena = new GenerationalArena<number>();

      expect(arena.get(-1, 1)).toBeUndefined();
      expect(arena.isValid(-1, 1)).toBe(false);
    });

    it("should return undefined for removed item", () => {
      const arena = new GenerationalArena<string>();
      const [idx, gen] = arena.insert("test");

      arena.remove(idx, gen);

      expect(arena.get(idx, gen)).toBeUndefined();
      expect(arena.remove(idx, gen)).toBeUndefined(); // Double remove
    });

    it("should handle out-of-bounds access gracefully", () => {
      const arena = new GenerationalArena<number>(4);
      arena.insert(1);

      expect(arena.get(100, 1)).toBeUndefined();
      expect(arena.isValid(100, 1)).toBe(false);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle interleaved operations", () => {
      const arena = new GenerationalArena<number>();
      const handles = [];

      // Insert 10 items
      for (let i = 0; i < 10; i++) {
        handles.push(arena.insert(i));
      }

      // Remove every other item
      for (let i = 0; i < handles.length; i += 2) {
        arena.remove(...handles[i]);
      }

      expect(arena.length).toBe(5);

      // Insert 5 more items (should reuse slots)
      for (let i = 10; i < 15; i++) {
        handles.push(arena.insert(i));
      }

      expect(arena.length).toBe(10);

      // Verify all valid handles work
      let validCount = 0;
      for (const [idx, gen] of handles) {
        if (arena.isValid(idx, gen)) {
          validCount++;
        }
      }

      expect(validCount).toBe(10);
    });

    it("should maintain consistency under heavy churn", () => {
      const arena = new GenerationalArena<{ id: number }>();
      const activeHandles = new Map<number, [number, number]>();
      let nextId = 0;

      // Simulate 1000 operations
      for (let op = 0; op < 1000; op++) {
        if (Math.random() < 0.6 || activeHandles.size === 0) {
          // Insert
          const id = nextId++;
          const handle = arena.insert({ id });
          activeHandles.set(id, handle);
        } else {
          // Remove random item
          const ids = Array.from(activeHandles.keys());
          const id = ids[Math.floor(Math.random() * ids.length)];
          const handle = activeHandles.get(id)!;

          arena.remove(...handle);
          activeHandles.delete(id);
        }
      }

      // Verify all active handles are valid
      for (const [id, [idx, gen]] of activeHandles) {
        const value = arena.get(idx, gen);
        expect(value).toBeDefined();
        expect(value!.id).toBe(id);
      }

      expect(arena.length).toBe(activeHandles.size);
    });

    it("should handle objects with different types", () => {
      interface Item {
        type: "number" | "string" | "object";
        value: any;
      }

      const arena = new GenerationalArena<Item>();

      const h1 = arena.insert({ type: "number", value: 42 });
      const h2 = arena.insert({ type: "string", value: "hello" });
      const h3 = arena.insert({ type: "object", value: { nested: true } });

      expect(arena.get(...h1)?.value).toBe(42);
      expect(arena.get(...h2)?.value).toBe("hello");
      expect(arena.get(...h3)?.value).toEqual({ nested: true });
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero initial capacity", () => {
      const arena = new GenerationalArena<number>(0);
      const [idx, gen] = arena.insert(1);

      expect(arena.get(idx, gen)).toBe(1);
    });

    it("should handle large number of items", () => {
      const arena = new GenerationalArena<number>();
      const count = 10000;
      const handles = [];

      for (let i = 0; i < count; i++) {
        handles.push(arena.insert(i));
      }

      expect(arena.length).toBe(count);

      // Spot check some values
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor(Math.random() * count);
        const [handleIdx, handleGen] = handles[idx];
        expect(arena.get(handleIdx, handleGen)).toBe(idx);
      }
    });

    it("should handle undefined values", () => {
      const arena = new GenerationalArena<undefined>();
      const [idx, gen] = arena.insert(undefined);

      // Should be able to store undefined but still be valid
      expect(arena.isValid(idx, gen)).toBe(true);
      expect(arena.get(idx, gen)).toBeUndefined();
    });

    it("should handle null values", () => {
      const arena = new GenerationalArena<null>();
      const [idx, gen] = arena.insert(null);

      expect(arena.isValid(idx, gen)).toBe(true);
      expect(arena.get(idx, gen)).toBe(null);
    });
  });
});
