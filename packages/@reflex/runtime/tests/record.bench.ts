import { bench, describe } from "vitest";
import { RecordFactory } from "../src/immutable/record";

// ───────────── Setup ─────────────
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

// ───────────── Benchmarks ─────────────
describe("Record", () => {
  bench("Create simple Point", () => {
    const p = Point.create({ x: 10, y: 20 });
  });

  bench("Create Circle with computed properties", () => {
    const c = Circle.create({ radius: 5 });
    void c.area; // вычисляем поле area
  });

  bench("Fork Point with change", () => {
    const p1 = Point.create({ x: 5, y: 10 });
    const p2 = RecordFactory.fork(p1, { x: 50 });
  });

  bench("Fork Point with no change", () => {
    const p1 = Point.create({ x: 5, y: 10 });
    const p2 = RecordFactory.fork(p1, { x: 5 }); // тот же объект
  });

  bench("Equals simple Points", () => {
    const p1 = Point.create({ x: 10, y: 20 });
    const p2 = Point.create({ x: 10, y: 20 });
    Point.equals(p1, p2);
  });

  bench("HashCode computation for Point", () => {
    const p = Point.create({ x: 123, y: 456 });
    void p.hashCode;
  });

  bench("Create and hash 1000 Points", () => {
    for (let i = 0; i < 1000; i++) {
      const p = Point.create({ x: i, y: i * 2 });
      void p.hashCode;
    }
  });

  bench("Nested Records creation", () => {
    for (let i = 0; i < 1000; i++) {
      Person.create({
        name: `Person${i}`,
        age: i % 50,
        position: Point.create({ x: i, y: i }),
      });
    }
  });
});
