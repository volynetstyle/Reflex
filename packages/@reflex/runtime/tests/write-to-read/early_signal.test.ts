import { describe, expect, it } from "vitest";
import { currentComputation } from "../../src/execution";
import { writeSignal, readSignal } from "../../src/reactivity/api";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import { computed, effect, signal } from "../api/reactivity";
import { NodeKind } from "../../src/reactivity/shape/ReactiveMeta";

describe("T0_1: Computed recomputation counts", () => {
  it("counts recomputations precisely", () => {
    const calls = {
      sumAB: 0,
      sumBC: 0,
      doubleAB: 0,
      mix: 0,
      final: 0,
    };

    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const [c, setC] = signal(3);

    const sumAB = computed(() => {
      calls.sumAB++;
      return a() + b();
    });

    const sumBC = computed(() => {
      calls.sumBC++;
      return b() + c();
    });

    const doubleAB = computed(() => {
      calls.doubleAB++;
      return sumAB() * 2;
    });

    const mix = computed(() => {
      calls.mix++;
      return doubleAB() + sumBC();
    });

    const final = computed(() => {
      calls.final++;
      return mix() + a();
    });

    // 🔹 initial read (cold graph)
    expect(final()).toBe(12);

    expect(calls).toEqual({
      sumAB: 1,
      sumBC: 1,
      doubleAB: 1,
      mix: 1,
      final: 1,
    });

    // 🔁 change B (center of graph)
    setB(10);
    expect(final()).toBe(36);

    expect(calls).toEqual({
      sumAB: 2, // depends on B
      sumBC: 2, // depends on B
      doubleAB: 2, // depends on sumAB
      mix: 2, // depends on both
      final: 2, // depends on mix
    });

    // 🔁 change A (leaf + reused twice)
    setA(5);
    expect(final()).toBe(48);

    expect(calls).toEqual({
      sumAB: 3, // depends on A
      sumBC: 2, // ❌ unchanged
      doubleAB: 3,
      mix: 3,
      final: 3, // A is read directly here
    });

    // 🔁 change C (other branch)
    setC(7);
    expect(final()).toBe(52);

    expect(calls).toEqual({
      sumAB: 3, // ❌ unchanged
      sumBC: 3,
      doubleAB: 3,
      mix: 4, // sumBC changed
      final: 4,
    });
  });
});

describe("T0_2: Lazy + batching invariants", () => {
  it("does not recompute until observed, batches writes", () => {
    const calls = {
      sumAB: 0,
      sumBC: 0,
      doubleAB: 0,
      mix: 0,
      final: 0,
    };

    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const [c, setC] = signal(3);

    const sumAB = computed(() => {
      calls.sumAB++;
      return a() + b();
    });

    const sumBC = computed(() => {
      calls.sumBC++;
      return b() + c();
    });

    const doubleAB = computed(() => {
      calls.doubleAB++;
      return sumAB() * 2;
    });

    const mix = computed(() => {
      calls.mix++;
      return doubleAB() + sumBC();
    });

    const final = computed(() => {
      calls.final++;
      return mix() + a();
    });

    // 🔹 cold read
    expect(final()).toBe(12);

    expect(calls).toEqual({
      sumAB: 1,
      sumBC: 1,
      doubleAB: 1,
      mix: 1,
      final: 1,
    });

    // 🔁 multiple writes, NO reads
    setB(10);
    setA(5);
    setC(7);

    // ❗ lazy invariant: nothing recomputed yet
    expect(calls).toEqual({
      sumAB: 1,
      sumBC: 1,
      doubleAB: 1,
      mix: 1,
      final: 1,
    });

    // 🔍 single read triggers full recompute
    expect(final()).toBe(52);

    expect(calls).toEqual({
      sumAB: 2, // depends on A + B
      sumBC: 2, // depends on B + C
      doubleAB: 2,
      mix: 2,
      final: 2,
    });
  });
});

// describe("T1_1: Comprehensive effect test", () => {
//   it(" 1) Basic effec check", () => {
//     const [a, setA] = signal(0);
//     const [b, setB] = signal(0);
//     const [c, setC] = signal(0);

//     setA(1);
//     setB(2);
//     setC(3);

//     effect(() => {
//       console.log(`Call once when "C" change = ${c()}`);
//     });

//     effect(() => {
//       console.log(
//         `The effect call's with current signal value of a = ${a()}, b = ${b()} and sielnt c = c.value`,
//       );

//       return () => {
//         console.log("Clean Up");
//       };
//     });
//   });
// });
// describe("T0_2: Signal → Computed causal propagation (lazy)", () => {
//   it("write only advances causal state, not evaluation", () => {
//     const a = new ReactiveNode(0, 0, 0, 0, KIND_SIGNAL);
//     const b = new ReactiveNode(0, 0, 0, 0, KIND_COMPUTED);

//     b.fn = () => (readSignal(a) as number) * 2;

//     // Initial evaluation (establish dependency)
//     beginComputation(b);
//     b.payload = b.fn();
//     endComputation();

//     const prevPayload = b.payload;
//     const prevT = b.t;
//     const prevV = b.v;

//     writeSignal(a, 3); // causal event only

//     // 🧠 Lazy invariant: value NOT recomputed
//     expect(b.payload).toBe(prevPayload);

//     // ⚙️ But causal metadata MUST NOT advance on value BUT MUST ON t
//     expect(b.v).toBe(prevV);
//     expect(b.t).toBe(a.t);
//     expect(b.t).toBeGreaterThan(prevT);

//     expect(tryReadFromComputed(b)).toBe(6); // Pull-On-Demand, and that value should be fresh
//   });
// });
