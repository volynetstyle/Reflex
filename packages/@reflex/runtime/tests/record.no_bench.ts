import { bench, describe } from "vitest";
import { RecordFactory } from "../src/immutable/record";

describe("Record - Creation Benchmarks", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });
  const Circle = RecordFactory.define(
    { x: 0, y: 0, radius: 1 },
    { area: (c) => Math.PI * c.radius * c.radius },
  );
  const Person = RecordFactory.define({
    name: "",
    age: 0,
    position: Point.create(),
  });

  bench("Create Point with defaults", () => {
    Point.create();
  });

  bench("Create Point with partial data", () => {
    Point.create({ x: 10 });
  });

  bench("Create Point with full data", () => {
    Point.create({ x: 10, y: 20 });
  });

  bench("Create Circle with computed", () => {
    const c = Circle.create({ radius: 5 });
    void c.area;
  });

  bench("Create nested Person", () => {
    Person.create({
      name: "Alice",
      age: 30,
      position: Point.create({ x: 100, y: 200 }),
    });
  });
});

describe("Record - Fork Benchmarks", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });
  const Large = RecordFactory.define({
    f0: 0,
    f1: 0,
    f2: 0,
    f3: 0,
    f4: 0,
    f5: 0,
    f6: 0,
    f7: 0,
    f8: 0,
    f9: 0,
  });

  const p = Point.create({ x: 5, y: 10 });
  const l = Large.create();

  bench("Fork Point - 1 field changed (O(k))", () => {
    RecordFactory.fork(p, { x: 50 });
  });

  bench("Fork Point - no change (fast path)", () => {
    RecordFactory.fork(p, { x: 5 });
  });

  bench("Fork Point - 2 fields changed", () => {
    RecordFactory.fork(p, { x: 50, y: 100 });
  });

  bench("Fork Large - 1 of 10 fields (O(k))", () => {
    RecordFactory.fork(l, { f0: 42 });
  });

  bench("Fork Large - 5 of 10 fields", () => {
    RecordFactory.fork(l, { f0: 1, f2: 2, f4: 3, f6: 4, f8: 5 });
  });
});

describe("Record - Equals & Hash Benchmarks", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });
  const p1 = Point.create({ x: 10, y: 20 });
  const p2 = Point.create({ x: 10, y: 20 });
  const p3 = Point.create({ x: 15, y: 25 });

  bench("Equals - same reference", () => {
    Point.equals(p1, p1);
  });

  bench("Equals - equal values", () => {
    Point.equals(p1, p2);
  });

  bench("Equals - different values", () => {
    Point.equals(p1, p3);
  });

  bench("HashCode computation", () => {
    void p1.hashCode;
  });

  bench("HashCode cached access", () => {
    p1.hashCode;
    p1.hashCode;
    p1.hashCode;
  });
});

describe("Record - Diff Benchmarks", () => {
  const Point = RecordFactory.define({ x: 0, y: 0, z: 0 });
  const p1 = Point.create({ x: 1, y: 2, z: 3 });
  const p2 = RecordFactory.fork(p1, { x: 10 });
  const p3 = RecordFactory.fork(p1, { x: 10, y: 20, z: 30 });

  bench("Diff - same instance", () => {
    RecordFactory.diff(p1, p1);
  });

  bench("Diff - 1 field changed", () => {
    RecordFactory.diff(p1, p2);
  });

  bench("Diff - all fields changed", () => {
    RecordFactory.diff(p1, p3);
  });
});

describe("Record - Stress Tests", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });
  const Person = RecordFactory.define({
    name: "",
    age: 0,
    position: Point.create(),
  });

  bench("Create 1000 Points", () => {
    for (let i = 0; i < 1000; i++) {
      Point.create({ x: i, y: i * 2 });
    }
  });

  bench("Create and hash 1000 Points", () => {
    for (let i = 0; i < 1000; i++) {
      const p = Point.create({ x: i, y: i * 2 });
      void p.hashCode;
    }
  });

  bench("Fork chain 1000 times", () => {
    let p = Point.create({ x: 0, y: 0 });
    for (let i = 0; i < 1000; i++) {
      p = RecordFactory.fork(p, { x: i }) as any;
    }
  });

  bench("Nested Records creation 1000x", () => {
    for (let i = 0; i < 1000; i++) {
      Person.create({
        name: `Person${i}`,
        age: i % 50,
        position: Point.create({ x: i, y: i }),
      });
    }
  });

  bench("Equals comparison 1000x", () => {
    const p1 = Point.create({ x: 100, y: 200 });
    const p2 = Point.create({ x: 100, y: 200 });
    for (let i = 0; i < 1000; i++) {
      Point.equals(p1, p2);
    }
  });
});
