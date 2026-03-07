import { describe, it, expect, beforeEach } from "vitest";
import { FourAryHeap } from "./compare/FourAryHeap";

describe("FourAryHeap", () => {
  let heap: FourAryHeap<string>;

  beforeEach(() => {
    heap = new FourAryHeap<string>();
  });

  // ─── базовое состояние ───────────────────────────────────────────────────────

  describe("initial state", () => {
    it("size() === 0", () => expect(heap.size()).toBe(0));
    it("isEmpty() === true", () => expect(heap.isEmpty()).toBe(true));
    it("peek() === undefined", () => expect(heap.peek()).toBeUndefined());
    it("popMin() === undefined", () => expect(heap.popMin()).toBeUndefined());
  });

  // ─── insert / peek ───────────────────────────────────────────────────────────

  describe("insert", () => {
    it("увеличивает size на 1", () => {
      heap.insert("a", 1);
      expect(heap.size()).toBe(1);
      expect(heap.isEmpty()).toBe(false);
    });

    it("peek возвращает элемент с наименьшим приоритетом", () => {
      heap.insert("high", 10);
      heap.insert("low", 1);
      heap.insert("mid", 5);
      expect(heap.peek()).toBe("low");
    });

    it("peek не удаляет элемент", () => {
      heap.insert("a", 1);
      heap.peek();
      expect(heap.size()).toBe(1);
    });

    it("одинаковые приоритеты — оба элемента вставляются", () => {
      heap.insert("a", 5);
      heap.insert("b", 5);
      expect(heap.size()).toBe(2);
    });
  });

  // ─── popMin ──────────────────────────────────────────────────────────────────

  describe("popMin", () => {
    it("возвращает единственный элемент", () => {
      heap.insert("only", 42);
      expect(heap.popMin()).toBe("only");
      expect(heap.size()).toBe(0);
    });

    it("извлекает элементы в порядке возрастания приоритета", () => {
      heap.insert("c", 3);
      heap.insert("a", 1);
      heap.insert("b", 2);

      expect(heap.popMin()).toBe("a");
      expect(heap.popMin()).toBe("b");
      expect(heap.popMin()).toBe("c");
    });

    it("уменьшает size", () => {
      heap.insert("a", 1);
      heap.insert("b", 2);
      heap.popMin();
      expect(heap.size()).toBe(1);
    });

    it("возвращает undefined на пустой куче", () => {
      heap.insert("a", 1);
      heap.popMin();
      expect(heap.popMin()).toBeUndefined();
    });
  });

  // ─── порядок сортировки ──────────────────────────────────────────────────────

  describe("heap sort", () => {
    it("сортирует случайный массив", () => {
      const priorities = [7, 3, 9, 1, 5, 4, 8, 2, 6, 0];
      priorities.forEach((p) => heap.insert(`v${p}`, p));

      const result: number[] = [];
      while (!heap.isEmpty()) {
        const val = heap.popMin()!;
        result.push(Number(val.slice(1)));
      }

      expect(result).toEqual([...priorities].sort((a, b) => a - b));
    });

    it("работает с дублирующимися приоритетами", () => {
      heap.insert("a", 2);
      heap.insert("b", 1);
      heap.insert("c", 2);
      heap.insert("d", 1);

      const first = heap.popMin()!;
      const second = heap.popMin()!;
      // оба имеют приоритет 1
      expect(["b", "d"]).toContain(first);
      expect(["b", "d"]).toContain(second);
      expect(first).not.toBe(second);
    });

    it("корректно работает после серии insert + popMin", () => {
      heap.insert("x", 5);
      heap.insert("y", 3);
      expect(heap.popMin()).toBe("y");

      heap.insert("z", 1);
      heap.insert("w", 4);
      expect(heap.popMin()).toBe("z");
      expect(heap.popMin()).toBe("w");
      expect(heap.popMin()).toBe("x");
    });
  });

  // ─── граничные случаи ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("отрицательные приоритеты", () => {
      heap.insert("neg", -10);
      heap.insert("zero", 0);
      heap.insert("pos", 10);

      expect(heap.popMin()).toBe("neg");
      expect(heap.popMin()).toBe("zero");
      expect(heap.popMin()).toBe("pos");
    });

    it("дробные приоритеты", () => {
      heap.insert("b", 1.5);
      heap.insert("a", 0.5);
      heap.insert("c", 2.5);

      expect(heap.popMin()).toBe("a");
      expect(heap.popMin()).toBe("b");
      expect(heap.popMin()).toBe("c");
    });

    it("Infinity и -Infinity", () => {
      heap.insert("inf", Infinity);
      heap.insert("ninf", -Infinity);
      heap.insert("zero", 0);

      expect(heap.popMin()).toBe("ninf");
      expect(heap.popMin()).toBe("zero");
      expect(heap.popMin()).toBe("inf");
    });

    it("один элемент — peek и popMin согласованы", () => {
      heap.insert("solo", 99);
      expect(heap.peek()).toBe("solo");
      expect(heap.popMin()).toBe("solo");
      expect(heap.peek()).toBeUndefined();
    });
  });

  // ─── стресс / рост буфера ────────────────────────────────────────────────────

  describe("stress & grow", () => {
    it("корректно работает при N > начальной ёмкости (64)", () => {
      const n = 200;
      const priorities = Array.from({ length: n }, (_, i) => n - i); // убывающий

      priorities.forEach((p, i) => heap.insert(`item${i}`, p));
      expect(heap.size()).toBe(n);

      let prev = -Infinity;
      while (!heap.isEmpty()) {
        const val = heap.popMin()!;
        const p = priorities[Number(val.slice(4))];
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    });

    it("1000 элементов выходят в отсортированном порядке", () => {
      const n = 1000;
      const nums = Array.from({ length: n }, () => Math.random() * 10000);
      nums.forEach((p, i) => heap.insert(i + "", p));

      const out: number[] = [];
      while (!heap.isEmpty()) {
        const el = heap.popMin()!;

        out.push(nums[Number(el)]);
      }

      for (let i = 1; i < out.length; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
      }
    });
  });

  // ─── clear ───────────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("сбрасывает кучу в пустое состояние", () => {
      heap.insert("a", 1);
      heap.insert("b", 2);
      heap.clear();

      expect(heap.size()).toBe(0);
      expect(heap.isEmpty()).toBe(true);
      expect(heap.peek()).toBeUndefined();
      expect(heap.popMin()).toBeUndefined();
    });

    it("после clear можно снова вставлять", () => {
      heap.insert("old", 1);
      heap.clear();
      heap.insert("new", 42);

      expect(heap.size()).toBe(1);
      expect(heap.popMin()).toBe("new");
    });
  });

  // ─── типизация ───────────────────────────────────────────────────────────────

  describe("generic type", () => {
    it("работает с числами", () => {
      const h = new FourAryHeap<number>();
      h.insert(100, 3);
      h.insert(200, 1);
      expect(h.popMin()).toBe(200);
    });

    it("работает с объектами", () => {
      const h = new FourAryHeap<{ name: string }>();
      h.insert({ name: "low" }, 1);
      h.insert({ name: "high" }, 10);
      expect(h.popMin()).toEqual({ name: "low" });
    });
  });
});
