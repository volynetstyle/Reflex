import { describe, it, expect } from "vitest";
import { RecordFactory } from "../src/immutable/record";

describe("RecordFactory - Core Functionality", () => {
  const User = RecordFactory.define({
    id: 0,
    name: "",
    active: false,
  });

  it("should create instance with defaults", () => {
    const u = User.create();
    expect(u.id).toBe(0);
    expect(u.name).toBe("");
    expect(u.active).toBe(false);
    expect(typeof u.hashCode).toBe("number");
  });

  it("should create instance with partial overrides", () => {
    const u = User.create({ name: "Alice" });
    expect(u.id).toBe(0);
    expect(u.name).toBe("Alice");
    expect(u.active).toBe(false);
  });

  it("should validate field types", () => {
    expect(() => User.create({ id: "string" as any })).toThrow(TypeError);
  });

  it("should compute hashCode consistently", () => {
    const u1 = User.create({ id: 1, name: "Bob" });
    const u2 = User.create({ id: 1, name: "Bob" });
    expect(u1.hashCode).toBe(u2.hashCode);
    expect(User.equals(u1, u2)).toBe(true);
  });

  it("should detect unequal objects", () => {
    const u1 = User.create({ id: 1 });
    const u2 = User.create({ id: 2 });
    expect(User.equals(u1, u2)).toBe(false);
  });

  it("should create multiple instances independently", () => {
    const u1 = User.create({ id: 1 });
    const u2 = User.create({ id: 2 });
    expect(u1.id).toBe(1);
    expect(u2.id).toBe(2);
    expect(u1).not.toBe(u2);
  });
});

describe("RecordFactory - Fork Operations", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });

  it("should handle fork with changes", () => {
    const p1 = Point.create({ x: 1, y: 2 });
    const p2 = RecordFactory.fork(p1, { x: 10 });
    expect(p2.x).toBe(10);
    expect(p2.y).toBe(2);
    expect(p1.x).toBe(1);
    expect(p1).not.toBe(p2);
  });

  it("should return same instance if fork has no changes", () => {
    const p1 = Point.create({ x: 5, y: 10 });
    const p2 = RecordFactory.fork(p1, { x: 5 });
    expect(p1).toBe(p2);
  });

  it("should handle fork with empty updates", () => {
    const p1 = Point.create({ x: 5 });
    const p2 = RecordFactory.fork(p1, {});
    expect(p1).toBe(p2);
  });

  it("should handle fork with null updates", () => {
    const p1 = Point.create({ x: 5 });
    const p2 = RecordFactory.fork(p1, null as any);
    expect(p1).toBe(p2);
  });

  it("should fork multiple fields at once", () => {
    const p1 = Point.create({ x: 1, y: 2 });
    const p2 = RecordFactory.fork(p1, { x: 10, y: 20 });
    expect(p2.x).toBe(10);
    expect(p2.y).toBe(20);
    expect(p1).not.toBe(p2);
  });
});

describe("RecordFactory - Computed Fields", () => {
  it("should support computed fields", () => {
    const Person = RecordFactory.define(
      { firstName: "John", lastName: "Doe" },
      { fullName: (x) => `${x.firstName} ${x.lastName}` },
    );
    const p = Person.create({ firstName: "Jane" });
    expect(p.fullName).toBe("Jane Doe");
  });

  it("should cache computed values", () => {
    let count = 0;
    const C = RecordFactory.define(
      { a: 1 },
      {
        b: (x) => {
          count++;
          return x.a + 1;
        },
      },
    );
    const c = C.create();
    expect(c.b).toBe(2);
    expect(c.b).toBe(2);
    expect(c.b).toBe(2);
    expect(count).toBe(1);
  });

  it("should recompute after fork", () => {
    const Circle = RecordFactory.define(
      { radius: 1 },
      { area: (c) => Math.PI * c.radius * c.radius },
    );
    const c1 = Circle.create({ radius: 5 });
    const c2 = RecordFactory.fork(c1, { radius: 10 });
    expect(c1.area).toBeCloseTo(Math.PI * 25);
    expect(c2.area).toBeCloseTo(Math.PI * 100);
  });

  it("should support multiple computed fields", () => {
    const Rect = RecordFactory.define(
      { width: 0, height: 0 },
      {
        area: (r) => r.width * r.height,
        perimeter: (r) => 2 * (r.width + r.height),
      },
    );
    const r = Rect.create({ width: 10, height: 5 });
    expect(r.area).toBe(50);
    expect(r.perimeter).toBe(30);
  });
});

describe("RecordFactory - Nested Records", () => {
  const Address = RecordFactory.define({ city: "NY", zip: 0 });
  const Person = RecordFactory.define({
    name: "A",
    addr: Address.create(),
  });

  it("should recursively compare nested Records", () => {
    const p1 = Person.create();
    const p2 = Person.create();
    expect(Person.equals(p1, p2)).toBe(true);
  });

  it("should detect nested Record changes", () => {
    const p1 = Person.create();
    const p2 = RecordFactory.fork(p1, {
      addr: Address.create({ city: "LA" }),
    });
    expect(Person.equals(p1, p2)).toBe(false);
  });

  it("should preserve nested Record reference if unchanged", () => {
    const addr = Address.create({ city: "SF" });
    const p1 = Person.create({ addr });
    const p2 = RecordFactory.fork(p1, { name: "B" });
    expect(p2.addr).toBe(addr);
  });

  it("should throw on invalid nested Record type", () => {
    const invalid = { addr: { city: "LA" } };
    expect(() => Person.create(invalid as any)).toThrow(TypeError);
  });

  it("should handle deep nesting", () => {
    const Level3 = RecordFactory.define({ value: 0 });
    const Level2 = RecordFactory.define({ l3: Level3.create() });
    const Level1 = RecordFactory.define({ l2: Level2.create() });

    const l1 = Level1.create();
    const l3Updated = RecordFactory.fork(l1.l2.l3, { value: 42 });
    const l2Updated = RecordFactory.fork(l1.l2, { l3: l3Updated });
    const l1Updated = RecordFactory.fork(l1, { l2: l2Updated });

    expect(l1Updated.l2.l3.value).toBe(42);
    expect(l1.l2.l3.value).toBe(0);
  });
});

describe("RecordFactory - Hash & Equals", () => {
  const Point = RecordFactory.define({ x: 0, y: 0 });

  it("should have stable hashCode", () => {
    const p = Point.create({ x: 10, y: 20 });
    const h1 = p.hashCode;
    const h2 = p.hashCode;
    const h3 = p.hashCode;
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it("should differentiate hash collisions with equals", () => {
    const p1 = Point.create({ x: 1, y: 2 });
    const p2 = Point.create({ x: 3, y: 4 });

    if (p1.hashCode === p2.hashCode) {
      expect(Point.equals(p1, p2)).toBe(false);
    }
  });

  it("should handle negative zero", () => {
    const N = RecordFactory.define({ val: 0 });
    const n1 = N.create({ val: 0 });
    const n2 = N.create({ val: -0 });
    expect(N.equals(n1, n2)).toBe(true);
  });

  it("should handle boolean fields", () => {
    const B = RecordFactory.define({ flag: Boolean(false) });
    const b1 = B.create({ flag: true });
    const b2 = B.create({ flag: false });
    expect(b1.hashCode).not.toBe(b2.hashCode);
    expect(B.equals(b1, b2)).toBe(false);
  });

  it("should handle null values correctly", () => {
    const N = RecordFactory.define({ a: null });
    const n1 = N.create();
    expect(n1.a).toBeNull();
    const n2 = RecordFactory.fork(n1, { a: null });
    expect(n1).toBe(n2);
  });

  it("should detect different types in equals", () => {
    const A = RecordFactory.define({ x: 0 });
    const B = RecordFactory.define({ x: 0 });
    const a = A.create({ x: 1 });
    const b = B.create({ x: 1 });
    expect(A.equals(a, b)).toBe(false);
  });
});

describe("RecordFactory - Diff", () => {
  const Point = RecordFactory.define({ x: 0, y: 0, z: 0 });

  it("should return empty diff for same instance", () => {
    const p = Point.create({ x: 1 });
    const diff = RecordFactory.diff(p, p);
    expect(diff.length).toBe(0);
  });

  it("should detect single field change", () => {
    const p1 = Point.create({ x: 1, y: 2, z: 3 });
    const p2 = RecordFactory.fork(p1, { x: 10 });
    const diff = RecordFactory.diff(p1, p2);
    expect(diff.length).toBe(1);
    expect(diff[0]).toBe(0); // index of 'x'
  });

  it("should detect multiple field changes", () => {
    const p1 = Point.create({ x: 1, y: 2, z: 3 });
    const p2 = RecordFactory.fork(p1, { x: 10, z: 30 });
    const diff = RecordFactory.diff(p1, p2);
    expect(diff.length).toBe(2);
    expect(Array.from(diff)).toContain(0); // 'x'
    expect(Array.from(diff)).toContain(2); // 'z'
  });

  it("should throw on different types", () => {
    const A = RecordFactory.define({ x: 0 });
    const B = RecordFactory.define({ x: 0 });
    const a = A.create();
    const b = B.create();
    expect(() => RecordFactory.diff(a, b)).toThrow(TypeError);
  });
});

describe("RecordFactory - Edge Cases", () => {
  it("should handle empty Record", () => {
    const Empty = RecordFactory.define({});
    const e1 = Empty.create();
    const e2 = Empty.create();
    expect(Empty.equals(e1, e2)).toBe(true);
    expect(typeof e1.hashCode).toBe("number");
  });

  it("should handle large field count", () => {
    const fields: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      fields[`field${i}`] = i;
    }
    const Large = RecordFactory.define(fields);
    const l1 = Large.create();
    const l2 = Large.create();
    expect(Large.equals(l1, l2)).toBe(true);
  });

  it("should handle string hashing", () => {
    const S = RecordFactory.define({ text: "" });
    const s1 = S.create({ text: "hello" });
    const s2 = S.create({ text: "world" });
    expect(s1.hashCode).not.toBe(s2.hashCode);
  });

  it("should be immutable", () => {
    const Point = RecordFactory.define({ x: 0, y: 0 });
    const p = Point.create({ x: 1, y: 2 });
    expect(() => {
      (p as any).x = 10;
    }).toThrow();
  });
});

