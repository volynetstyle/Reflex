import { describe, expect, it, vi, beforeEach } from "vitest"
import { createRuntime } from "./api.js"

// ─── Per-test runtime isolation ──────────────────────────────────────────────
// Кожен тест отримує свій createRuntime() → власний EngineContext + OrderList.
// Без цього сигнали з різних тестів змішуються в одному topo list,
// і activeComputed tracking реєструє ребра між тестами.

function makeHelpers() {
  const rt = createRuntime()

  const signal = <T>(v: T) => {
    const s = rt.signal(v)
    return [s.read.bind(s), s.write.bind(s)] as const
  }

  const computed = <T>(fn: () => T) => rt.computed(fn)

  return { signal, computed, rt }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("graph invariants", () => {

  // ─── 1. Correctness ──────────────────────────────────────────────────────
  describe("correctness", () => {
    it("signal: initial value", () => {
      const { signal } = makeHelpers()
      const [x] = signal(10)
      expect(x()).toBe(10)
    })

    it("computed: derives from signal", () => {
      const { signal, computed } = makeHelpers()
      const [x] = signal(10)
      const a = computed(() => x() * 2)
      expect(a()).toBe(20)
    })

    it("computed: updates after write", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(1)
      const a = computed(() => x() + 1)
      setX(5)
      expect(a()).toBe(6)
    })

    it("chain a→b→c: correct value after update", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(10)
      const a = computed(() => x() + 1)
      const b = computed(() => a() + 1)
      const c = computed(() => b() + 1)
      expect(c()).toBe(13)
      setX(20)
      expect(c()).toBe(23)
    })

    it("diamond D=B(a)+C(a): correct value after update", () => {
      const { signal, computed } = makeHelpers()
      const [a, setA] = signal(1)
      const B = computed(() => a() + 1)
      const C = computed(() => a() * 2)
      const D = computed(() => B() + C())
      expect(D()).toBe(4)
      setA(3)
      expect(D()).toBe(10)
    })

    it("two independent signals: only changed one affects result", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(10)
      const [y] = signal(5)
      const a = computed(() => x() + y())
      setX(20)
      expect(a()).toBe(25)
    })

    it("constant computed: no deps, stable value", () => {
      const { computed } = makeHelpers()
      const a = computed(() => 42)
      expect(a()).toBe(42)
      expect(a()).toBe(42)
    })

    it("multiple writes before read: final value wins", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(0)
      const a = computed(() => x())
      setX(1); setX(2); setX(3)
      expect(a()).toBe(3)
    })
  })

  // ─── 2. Memoisation ──────────────────────────────────────────────────────
  describe("memoisation", () => {
    it("no recompute on repeated read", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn((x: number) => x * 2)
      const [x] = signal(5)
      const a = computed(() => fn(x()))
      a(); a(); a()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("exactly one recompute per write", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn((x: number) => x)
      const [x, setX] = signal(1)
      const a = computed(() => fn(x()))
      a(); setX(2); a(); setX(3); a()
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("no recompute when written with same value", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn((x: number) => x)
      const [x, setX] = signal(42)
      const a = computed(() => fn(x()))
      a(); setX(42); a()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("multiple writes before read: only one recompute", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn((x: number) => x)
      const [x, setX] = signal(0)
      const a = computed(() => fn(x()))
      a(); setX(1); setX(2); setX(3); a()
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("chain: each node recomputes exactly once per upstream write", () => {
      const { signal, computed } = makeHelpers()
      const fnA = vi.fn((x: number) => x + 1)
      const fnB = vi.fn((x: number) => x + 1)
      const fnC = vi.fn((x: number) => x + 1)
      const [x, setX] = signal(0)
      const a = computed(() => fnA(x()))
      const b = computed(() => fnB(a()))
      const c = computed(() => fnC(b()))
      c(); setX(1); c()
      expect(fnA).toHaveBeenCalledTimes(2)
      expect(fnB).toHaveBeenCalledTimes(2)
      expect(fnC).toHaveBeenCalledTimes(2)
    })

    it("diamond: each branch once, sink once", () => {
      const { signal, computed } = makeHelpers()
      const fnB = vi.fn((x: number) => x + 1)
      const fnC = vi.fn((x: number) => x * 2)
      const fnD = vi.fn((b: number, c: number) => b + c)
      const [a, setA] = signal(1)
      const B = computed(() => fnB(a()))
      const C = computed(() => fnC(a()))
      const D = computed(() => fnD(B(), C()))
      D(); setA(2); D()
      expect(fnB).toHaveBeenCalledTimes(2)
      expect(fnC).toHaveBeenCalledTimes(2)
      expect(fnD).toHaveBeenCalledTimes(2)
    })
  })

  // ─── 3. Selective recomputation ──────────────────────────────────────────
  describe("selective recomputation", () => {
    it("unrelated branch does not recompute", () => {
      const { signal, computed } = makeHelpers()
      const fnA = vi.fn((x: number) => x)
      const fnB = vi.fn((y: number) => y)
      const [x, setX] = signal(10)
      const [y] = signal(10)
      const a = computed(() => fnA(x()))
      const b = computed(() => fnB(y()))
      const c = computed(() => a() + b())
      c(); setX(20); c()
      expect(fnA).toHaveBeenCalledTimes(2)
      expect(fnB).toHaveBeenCalledTimes(1)
    })

    it("wide fan-out: only x-branch recomputes when x changes", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(1)
      const [y] = signal(1)
      const fns = Array.from({ length: 5 }, () => vi.fn((v: number) => v))
      const nodes = [
        computed(() => fns[0]!(x())),
        computed(() => fns[1]!(x())),
        computed(() => fns[2]!(x())),
        computed(() => fns[3]!(y())),
        computed(() => fns[4]!(y())),
      ]
      nodes.forEach(n => n()); setX(2); nodes.forEach(n => n())
      expect(fns[0]).toHaveBeenCalledTimes(2)
      expect(fns[1]).toHaveBeenCalledTimes(2)
      expect(fns[2]).toHaveBeenCalledTimes(2)
      expect(fns[3]).toHaveBeenCalledTimes(1)
      expect(fns[4]).toHaveBeenCalledTimes(1)
    })

    it("SAC: constant computed shields downstream from recompute", () => {
      const { signal, computed } = makeHelpers()
      const fnB = vi.fn(() => 42)
      const fnC = vi.fn((x: number) => x + 1)
      const [x, setX] = signal(1)
      const b = computed(fnB)
      const c = computed(() => fnC(b()))
      c(); setX(2); c()
      expect(fnB).toHaveBeenCalledTimes(1)
      expect(fnC).toHaveBeenCalledTimes(1)
    })

    it("SAC diamond: branch returns same value → sink does not recompute", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(1)
      const fnB = vi.fn(() => x() * 0)
      const fnC = vi.fn(() => x())
      const fnD = vi.fn(() => b() + c())
      const b = computed(fnB)
      const c = computed(fnC)
      const d = computed(fnD)
      d(); expect(d()).toBe(1)

      setX(2); d()
      expect(fnB).toHaveBeenCalledTimes(2)
      expect(fnC).toHaveBeenCalledTimes(2)
      expect(fnD).toHaveBeenCalledTimes(2)
      expect(d()).toBe(2)

      setX(3); d()
      expect(fnB).toHaveBeenCalledTimes(3)
      expect(fnC).toHaveBeenCalledTimes(3)
      expect(fnD).toHaveBeenCalledTimes(3)
      expect(d()).toBe(3)
    })

    it("SAC diamond: both branches return same value → sink does not recompute", () => {
      const { signal, computed } = makeHelpers()
      const [x, setX] = signal(1)
      const fnB = vi.fn(() => { x(); return 10 })
      const fnC = vi.fn(() => { x(); return 20 })
      const fnD = vi.fn(() => b() + c())
      const b = computed(fnB)
      const c = computed(fnC)
      const d = computed(fnD)
      d(); expect(d()).toBe(30)

      setX(2); d()
      expect(fnB).toHaveBeenCalledTimes(2)
      expect(fnC).toHaveBeenCalledTimes(2)
      expect(fnD).toHaveBeenCalledTimes(1)   // SAC: обидві гілки не змінились

      setX(3); d()
      expect(fnD).toHaveBeenCalledTimes(1)
      expect(d()).toBe(30)
    })

    it("SAC: b recomputes but returns same value → c does not recompute", () => {
      const { signal, computed } = makeHelpers()
      const fnC = vi.fn((x: number) => x + 1)
      const [x, setX] = signal(1)
      const b = computed(() => { x(); return 42 })
      const c = computed(() => fnC(b()))
      c(); expect(fnC).toHaveBeenCalledTimes(1)
      setX(2); c()
      expect(fnC).toHaveBeenCalledTimes(1)
    })
  })

  // ─── 4. Dynamic dependencies ─────────────────────────────────────────────
  describe("dynamic dependencies", () => {
    it("branch switch: reads correct dep after switch", () => {
      const { signal, computed } = makeHelpers()
      const [cond, setCond] = signal(true)
      const [a] = signal(1)
      const [b] = signal(2)
      const c = computed(() => cond() ? a() : b())
      expect(c()).toBe(1)
      setCond(false)
      expect(c()).toBe(2)
    })

    it("branch switch: old dep no longer triggers recompute", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn()
      const [cond, setCond] = signal(true)
      const [a, setA] = signal(1)
      const [b] = signal(2)
      const c = computed(() => { fn(); return cond() ? a() : b() })
      c()
      setCond(false); c()   // тепер читає b, відписується від a
      fn.mockClear()
      setA(99); c()         // a змінився, але c читає b — не recompute
      expect(fn).toHaveBeenCalledTimes(0)
    })

    it("branch switch: new dep triggers recompute after switch", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn()
      const [cond, setCond] = signal(true)
      const [a] = signal(1)
      const [b, setB] = signal(2)
      const c = computed(() => { fn(); return cond() ? a() : b() })
      c(); setCond(false); c()  // тепер читає b
      fn.mockClear()
      setB(99); c()
      expect(fn).toHaveBeenCalledTimes(1)
      expect(c()).toBe(99)
    })
  })

  // ─── 5. Structural invariants ─────────────────────────────────────────────
  describe("structural invariants", () => {
    it("lazy: computed does not run until read", () => {
      const { computed } = makeHelpers()
      const fn = vi.fn(() => 1)
      computed(fn)
      expect(fn).not.toHaveBeenCalled()
    })

    it("lazy: write without read does not trigger recompute", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn((x: number) => x)
      const [x, setX] = signal(1)
      const a = computed(() => fn(x()))
      a(); setX(2); setX(3)
      expect(fn).toHaveBeenCalledTimes(1)
      a()
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("deep chain 100: recomputes only dirty nodes", () => {
      const { signal, computed } = makeHelpers()
      const calls: number[] = []
      const [x, setX] = signal(0)
      let prev = computed(() => { calls.push(0); return x() })
      for (let i = 1; i < 100; i++) {
        const p = prev; const idx = i
        prev = computed(() => { calls.push(idx); return p() })
      }
      const tail = prev
      tail(); expect(calls.length).toBe(100)

      calls.length = 0
      tail()
      expect(calls.length).toBe(0)

      calls.length = 0
      setX(1); tail()
      expect(calls.length).toBe(100)
    })

    it("deep chain: unrelated signal does not dirty chain", () => {
      const { signal, computed } = makeHelpers()
      const fn = vi.fn()
      const [x] = signal(0)
      const [y, setY] = signal(0)
      let prev = computed(() => x())
      for (let i = 0; i < 10; i++) {
        const p = prev
        prev = computed(() => { fn(); return p() })
      }
      const tail = prev
      tail(); fn.mockClear()
      setY(1); void y; tail()
      expect(fn).toHaveBeenCalledTimes(0)
    })
  })
})