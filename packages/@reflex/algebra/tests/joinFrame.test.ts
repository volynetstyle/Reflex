// import { describe, it, expect } from "vitest";

// describe("Algebraic laws", () => {
//   it("A1: join is commutative", () => {
//     const join = (a: number, b: number) => Math.max(a, b);

//     const r = 0;
//     const a = 5;
//     const b = 7;

//     expect(join(join(r, a), b)).toBe(join(join(r, b), a));
//   });

//   it("A2: join is associative", () => {
//     const join = (a: number, b: number) => Math.max(a, b);

//     const r = 0;
//     const a = 3;
//     const b = 8;

//     expect(join(join(r, a), b)).toBe(join(r, join(a, b)));
//   });
//   it("A3: join is idempotent", () => {
//     const join = (a: number, b: number) => Math.max(a, b);

//     const r = 0;
//     const a = 5;

//     expect(join(join(r, a), a)).toBe(join(r, a));
//   });
// });

// describe("JoinFrame invariants", () => {
//   it("J1: arity is immutable", () => {
//     const join = createJoin(3, 0, Math.max, (x) => x);

//     expect(join.arity).toBe(3);
//     // @ts-expect-error
//     join.arity = 10;
//     expect(join.arity).toBe(3);
//   });

//   it("J2: arrived is derived from rank(value)", () => {
//     const join = createJoin(
//       3,
//       new Set<string>(),
//       (a, b) => {
//         b.forEach((x) => a.add(x));
//         return a;
//       },
//       (v) => v.size,
//     );

//     expect(join.arrived).toBe(0);

//     join.step(new Set(["A"]));
//     expect(join.arrived).toBe(1);

//     join.step(new Set(["A"])); // retry
//     expect(join.arrived).toBe(1);

//     join.step(new Set(["B", "C"]));
//     expect(join.arrived).toBe(3);
//   });

//   it("J3: step may be called arbitrarily (idempotent progress)", () => {
//     const join = createJoin(
//       3,
//       new Set<string>(),
//       (a, b) => {
//         b.forEach((x) => a.add(x));
//         return a;
//       },
//       (v) => v.size,
//     );

//     join.step(new Set(["A"]));
//     join.step(new Set(["A"]));
//     join.step(new Set(["A"]));

//     expect(join.arrived).toBe(1);
//     expect(join.done).toBe(false);
//   });
// });

// describe("Order-independence (scheduler-free)", () => {
//   it("Any delivery order yields the same final state", () => {
//     const mk = () =>
//       createJoin(
//         3,
//         new Set<string>(),
//         (a, b) => {
//           b.forEach((x) => a.add(x));
//           return a;
//         },
//         (v) => v.size,
//       );

//     const a = new Set(["A"]);
//     const b = new Set(["B"]);
//     const c = new Set(["C"]);

//     const j1 = mk();
//     j1.step(a);
//     j1.step(b);
//     j1.step(c);

//     const j2 = mk();
//     j2.step(c);
//     j2.step(a);
//     j2.step(b);

//     expect([...j1.value].sort()).toEqual([...j2.value].sort());
//     expect(j1.done).toBe(true);
//     expect(j2.done).toBe(true);
//   });
// });

// describe("Async delivery (setTimeout)", () => {
//   it("setTimeout does not affect correctness", async () => {
//     const join = createJoin(
//       3,
//       new Set<string>(),
//       (a, b) => {
//         b.forEach((x) => a.add(x));
//         return a;
//       },
//       (v) => v.size,
//     );

//     join.step(new Set(["A"]));

//     setTimeout(() => join.step(new Set(["B"])), 10);
//     setTimeout(() => join.step(new Set(["A"])), 5); // retry
//     setTimeout(() => join.step(new Set(["C"])), 0);

//     await new Promise((r) => setTimeout(r, 20));

//     expect(join.done).toBe(true);
//     expect([...join.value].sort()).toEqual(["A", "B", "C"]);
//   });
// });

// describe("Safety", () => {
//   it("rank never exceeds arity", () => {
//     const join = createJoin(
//       2,
//       new Set<string>(),
//       (a, b) => {
//         b.forEach((x) => a.add(x));
//         return a;
//       },
//       (v) => v.size,
//     );

//     join.step(new Set(["A"]));
//     join.step(new Set(["B"]));
//     join.step(new Set(["C"])); // logically extra

//     expect(join.arrived).toBeGreaterThanOrEqual(2);
//     expect(join.done).toBe(true);
//   });
// });
