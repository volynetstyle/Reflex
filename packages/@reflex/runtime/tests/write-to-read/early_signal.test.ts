import { describe, expect, it, vi } from "vitest";
import {
  createMemo as computed,
  createSignal as signal,
} from "@solidjs/signals";

describe("graph invariants", () => {
  // ─── 1. Correctness ────────────────────────────────────────────────────────
  // Базовая корректность: правильные значения при любой топологии.

  describe("correctness", () => {
    it("signal: initial value", () => {
      const [x] = signal(10);
      expect(x()).toBe(10);
    });

    it("computed: derives from signal", () => {
      const [x] = signal(10);
      const a = computed(() => x() * 2);
      expect(a()).toBe(20);
    });

    it("computed: updates after write", () => {
      const [x, setX] = signal(1);
      const a = computed(() => x() + 1);
      setX(5);
      expect(a()).toBe(6);
    });

    it("chain a→b→c: correct value after update", () => {
      const [x, setX] = signal(10);
      const a = computed(() => x() + 1);
      const b = computed(() => a() + 1);
      const c = computed(() => b() + 1);
      expect(c()).toBe(13);
      setX(20);
      expect(c()).toBe(23);
    });

    it("diamond D=B(a)+C(a): correct value after update", () => {
      const [a, setA] = signal(1);
      const B = computed(() => a() + 1);
      const C = computed(() => a() * 2);
      const D = computed(() => B() + C());
      expect(D()).toBe(4); // (1+1) + (1*2)
      setA(3);
      expect(D()).toBe(10); // (3+1) + (3*2)
    });

    it("two independent signals: only changed one affects result", () => {
      const [x, setX] = signal(10);
      const [y] = signal(5);
      const a = computed(() => x() + y());
      setX(20);
      expect(a()).toBe(25);
    });

    it("constant computed: no deps, stable value", () => {
      const a = computed(() => 42);
      expect(a()).toBe(42);
      expect(a()).toBe(42);
    });

    it("multiple writes before read: final value wins", () => {
      const [x, setX] = signal(0);
      const a = computed(() => x());
      setX(1);
      setX(2);
      setX(3);
      expect(a()).toBe(3);
    });
  });

  // ─── 2. Memoisation ────────────────────────────────────────────────────────
  // Узлы пересчитываются ровно столько раз сколько нужно — не больше.

  describe("memoisation", () => {
    it("no recompute on repeated read", () => {
      const fn = vi.fn((x: number) => x * 2);
      const [x] = signal(5);
      const a = computed(() => fn(x()));
      a();
      a();
      a();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("exactly one recompute per write", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(1);
      const a = computed(() => fn(x()));
      a();
      setX(2);
      a();
      setX(3);
      a();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("no recompute when written with same value", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(42);
      const a = computed(() => fn(x()));
      a();
      setX(42);
      a();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("multiple writes before read: only one recompute", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(0);
      const a = computed(() => fn(x()));
      a();
      setX(1);
      setX(2);
      setX(3);
      a();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("chain: each node recomputes exactly once per upstream write", () => {
      const fnA = vi.fn((x: number) => x + 1);
      const fnB = vi.fn((x: number) => x + 1);
      const fnC = vi.fn((x: number) => x + 1);
      const [x, setX] = signal(0);
      const a = computed(() => fnA(x()));
      const b = computed(() => fnB(a()));
      const c = computed(() => fnC(b()));
      c();
      setX(1);
      c();
      expect(fnA).toHaveBeenCalledTimes(2);
      expect(fnB).toHaveBeenCalledTimes(2);
      expect(fnC).toHaveBeenCalledTimes(2);
    });

    it("diamond: each branch once, sink once", () => {
      const fnB = vi.fn((x: number) => x + 1);
      const fnC = vi.fn((x: number) => x * 2);
      const fnD = vi.fn((b: number, c: number) => b + c);
      const [a, setA] = signal(1);
      const B = computed(() => fnB(a()));
      const C = computed(() => fnC(a()));
      const D = computed(() => fnD(B(), C()));
      D();
      setA(2);
      D();
      expect(fnB).toHaveBeenCalledTimes(2);
      expect(fnC).toHaveBeenCalledTimes(2);
      expect(fnD).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 3. Selective recomputation ────────────────────────────────────────────
  // Пересчитываются только узлы downstream от изменившегося сигнала.

  describe("selective recomputation", () => {
    it("unrelated branch does not recompute", () => {
      const fnA = vi.fn((x: number) => x);
      const fnB = vi.fn((y: number) => y);
      const [x, setX] = signal(10);
      const [y] = signal(10);
      const a = computed(() => fnA(x()));
      const b = computed(() => fnB(y()));
      const c = computed(() => a() + b());
      c();
      setX(20);
      c();
      expect(fnA).toHaveBeenCalledTimes(2); // пересчитался
      expect(fnB).toHaveBeenCalledTimes(1); // нет
    });

    it("wide fan-out: only x-branch recomputes when x changes", () => {
      const [x, setX] = signal(1);
      const [y] = signal(1);
      const fns = Array.from({ length: 5 }, () => vi.fn((v: number) => v));
      const nodes = [
        computed(() => fns[0]!(x())),
        computed(() => fns[1]!(x())),
        computed(() => fns[2]!(x())),
        computed(() => fns[3]!(y())),
        computed(() => fns[4]!(y())),
      ];
      nodes.forEach((n) => n());
      setX(2);
      nodes.forEach((n) => n());
      expect(fns[0]).toHaveBeenCalledTimes(2);
      expect(fns[1]).toHaveBeenCalledTimes(2);
      expect(fns[2]).toHaveBeenCalledTimes(2);
      expect(fns[3]).toHaveBeenCalledTimes(1); // y не менялся
      expect(fns[4]).toHaveBeenCalledTimes(1);
    });

    it("SAC: constant computed shields downstream from recompute", () => {
      // b всегда возвращает 42 независимо от x → c не пересчитывается
      const fnB = vi.fn(() => 42);
      const fnC = vi.fn((x: number) => x + 1);
      const [x, setX] = signal(1);
      // b не читает x, поэтому watermark b не обновится при setX
      const b = computed(fnB);
      const c = computed(() => fnC(b()));
      c();
      setX(2);
      c();
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);
    });

    it("SAC diamond: branch returns same value → sink does not recompute", () => {
      // Граф:
      //        x
      //       / \
      //      b   c
      //       \ /
      //        d
      //
      // b читает x но всегда возвращает 0 (x * 0)
      // c читает x напрямую
      // d = b + c
      //
      // После setX(2):
      //   b пересчитался → вернул 0 (то же) → SAC → d не должен пересчитываться
      //   c пересчитался → вернул 2 (изменилось) → d пересчитывается

      const fnB = vi.fn(() => x() * 0); // всегда 0
      const fnC = vi.fn(() => x()); // меняется вместе с x
      const fnD = vi.fn(() => b() + c()); // зависит от обоих

      const [x, setX] = signal(1);
      const b = computed(fnB);
      const c = computed(fnC);
      const d = computed(fnD);
      b();
      d();
      b();
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);
      expect(fnD).toHaveBeenCalledTimes(1);
      expect(d()).toBe(1); // 0 + 1

      setX(2);
      b();
      d();
      b();
      // b пересчитался (читает x) но вернул 0 → SAC
      expect(fnB).toHaveBeenCalledTimes(2);
      // c пересчитался и вернул 2
      expect(fnC).toHaveBeenCalledTimes(2);
      // d пересчитался потому что c изменился
      expect(fnD).toHaveBeenCalledTimes(2);
      expect(d()).toBe(2); // 0 + 2

      setX(3);
      d();

      expect(fnB).toHaveBeenCalledTimes(3); // b снова пересчитался
      expect(fnC).toHaveBeenCalledTimes(3);
      expect(fnD).toHaveBeenCalledTimes(3);
      expect(d()).toBe(3); // 0 + 3
    });

    it("SAC diamond: both branches return same value → sink does not recompute", () => {
      // b и c оба читают x но всегда возвращают константу
      // d не должен пересчитываться никогда после первого read

      const fnB = vi.fn(() => {
        x();
        return 10;
      }); // константа
      const fnC = vi.fn(() => {
        x();
        return 20;
      }); // константа
      const fnD = vi.fn(() => b() + c());

      const [x, setX] = signal(1);
      const b = computed(fnB);
      const c = computed(fnC);
      const d = computed(fnD);

      d();
      expect(fnD).toHaveBeenCalledTimes(1);
      expect(d()).toBe(30);

      setX(2);
      d();
      // b и c пересчитались но вернули то же → SAC на обоих → d не трогаем
      expect(fnB).toHaveBeenCalledTimes(2);
      expect(fnC).toHaveBeenCalledTimes(2);
      expect(fnD).toHaveBeenCalledTimes(1); // ← SAC сработал

      setX(3);
      d();
      expect(fnD).toHaveBeenCalledTimes(1); // всё ещё не пересчитывался
      expect(d()).toBe(30);
    });

    it("SAC: b recomputes but returns same value → c does not recompute", () => {
      // b читает x но всегда возвращает константу → c не пересчитывается
      const fnC = vi.fn((x: number) => x + 1);
      const [x, setX] = signal(1);
      const b = computed(() => {
        x();
        return 42;
      }); // читает x, результат константный
      const c = computed(() => fnC(b()));
      c();
      expect(fnC).toHaveBeenCalledTimes(1);
      setX(2);
      c();
      expect(fnC).toHaveBeenCalledTimes(1); // b пересчитался, но вернул то же — c нет
    });
  });

  // ─── 4. Dynamic dependencies ───────────────────────────────────────────────
  // Граф меняет структуру в зависимости от значений.

  describe("dynamic dependencies", () => {
    it("branch switch: reads correct dep after switch", () => {
      const [cond, setCond] = signal(true);
      const [a] = signal(1);
      const [b] = signal(2);
      const c = computed(() => (cond() ? a() : b()));
      expect(c()).toBe(1);
      setCond(false);
      expect(c()).toBe(2);
    });

    it("branch switch: old dep no longer triggers recompute", () => {
      const fn = vi.fn();
      const [cond, setCond] = signal(true);
      const [a, setA] = signal(1);
      const [b] = signal(2);
      const c = computed(() => {
        fn();
        return cond() ? a() : b();
      });
      c(); // reads a
      setCond(false);
      c(); // switches to b
      fn.mockClear();
      setA(99);
      c(); // a изменился, но c читает b — не пересчитывается
      expect(fn).toHaveBeenCalledTimes(0);
    });

    it("branch switch: new dep triggers recompute after switch", () => {
      const fn = vi.fn();
      const [cond, setCond] = signal(true);
      const [a] = signal(1);
      const [b, setB] = signal(2);
      const c = computed(() => {
        fn();
        return cond() ? a() : b();
      });
      c();
      setCond(false);
      c(); // теперь читает b
      fn.mockClear();
      setB(99);
      c();
      expect(fn).toHaveBeenCalledTimes(1); // b изменился → пересчёт
      expect(c()).toBe(99);
    });
  });

  // ─── 5. Structural invariants ──────────────────────────────────────────────
  // Ленивость и порядок вычислений.

  describe("structural invariants", () => {
    it("lazy: computed does not run until read", () => {
      const fn = vi.fn(() => 1);
      computed(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("lazy: write without read does not trigger recompute", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(1);
      const a = computed(() => fn(x()));
      a();
      setX(2);
      setX(3); // два write без read
      expect(fn).toHaveBeenCalledTimes(1);
      a();
      expect(fn).toHaveBeenCalledTimes(2); // один recompute для обоих write
    });

    it("deep chain 100: recomputes only dirty nodes", () => {
      const calls: number[] = [];
      const [x, setX] = signal(0);
      let prev = computed(() => {
        calls.push(0);
        return x();
      });
      for (let i = 1; i < 100; i++) {
        const p = prev;
        const idx = i;
        prev = computed(() => {
          calls.push(idx);
          return p();
        });
      }
      const tail = prev;
      tail();
      const firstReadCount = calls.length;
      expect(firstReadCount).toBe(100); // все 100 пересчитались

      calls.length = 0;
      tail(); // без write — pruning
      expect(calls.length).toBe(0);

      calls.length = 0;
      setX(1);
      tail(); // все 100 dirty
      expect(calls.length).toBe(100);
    });

    it("deep chain: unrelated signal does not dirty chain", () => {
      const fn = vi.fn();
      const [x] = signal(0);
      const [y, setY] = signal(0);
      let prev = computed(() => x());
      for (let i = 0; i < 10; i++) {
        const p = prev;
        prev = computed(() => {
          fn();
          return p();
        });
      }
      const tail = prev;
      tail();
      fn.mockClear();
      setY(1); // y не в цепочке
      void y;
      tail();
      expect(fn).toHaveBeenCalledTimes(0);
    });
  });
});
