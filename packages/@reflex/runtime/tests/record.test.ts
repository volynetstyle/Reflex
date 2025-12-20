import { describe, it, expect } from "vitest";
import { RecordFactory } from "../src/immutable/record";

describe('RecordFactory', () => {

  // Простая запись с примитивными полями
  const User = RecordFactory.define({
    id: 0,
    name: '',
    active: false,
  });

  it('should create instance with defaults', () => {
    const u = User.create();
    expect(u.id).toBe(0);
    expect(u.name).toBe('');
    expect(u.active).toBe(false);
    expect(typeof u.hashCode).toBe('number');
  });

  it('should create instance with partial overrides', () => {
    const u = User.create({ name: 'Alice' });
    expect(u.id).toBe(0);
    expect(u.name).toBe('Alice');
    expect(u.active).toBe(false);
  });

  it('should validate field types', () => {
    expect(() => User.create({ id: 'string' as any })).toThrow(TypeError);
  });

  it('should compute hashCode consistently', () => {
    const u1 = User.create({ id: 1, name: 'Bob' });
    const u2 = User.create({ id: 1, name: 'Bob' });
    expect(u1.hashCode).toBe(u2.hashCode);
    expect(User.equals(u1, u2)).toBe(true);
  });

  it('should detect unequal objects', () => {
    const u1 = User.create({ id: 1 });
    const u2 = User.create({ id: 2 });
    expect(User.equals(u1, u2)).toBe(false);
  });

  it('should handle fork with changes', () => {
    const u1 = User.create({ id: 1 });
    const u2 = RecordFactory.fork(u1, { id: 2 });
    expect(u2.id).toBe(2);
    expect(u1.id).toBe(1);
    expect(u1).not.toBe(u2);
  });

  it('should return same instance if fork has no changes', () => {
    const u1 = User.create({ id: 1 });
    const u2 = RecordFactory.fork(u1, { id: 1 });
    expect(u1).toBe(u2);
  });

  it('should support computed fields', () => {
    const Person = RecordFactory.define(
      { firstName: 'John', lastName: 'Doe' },
      { fullName: (x) => `${x.firstName} ${x.lastName}` }
    );
    const p = Person.create({ firstName: 'Jane' });
    expect(p.fullName).toBe('Jane Doe');
  });

  it('should cache computed values', () => {
    let count = 0;
    const C = RecordFactory.define(
      { a: 1 },
      { b: (x) => { count++; return x.a + 1; } }
    );
    const c = C.create();
    expect(c.b).toBe(2);
    expect(c.b).toBe(2); // cached
    expect(count).toBe(1);
  });

  it('should recursively compare nested Records', () => {
    const Address = RecordFactory.define({ city: 'NY' });
    const Person = RecordFactory.define({ name: 'A', addr: Address.create() });

    const p1 = Person.create();
    const p2 = Person.create();
    expect(Person.equals(p1, p2)).toBe(true);

    const p3 = RecordFactory.fork(p1, { addr: Address.create({ city: 'LA' }) });
    expect(Person.equals(p1, p3)).toBe(false);
  });

  it('should handle null values correctly', () => {
    const N = RecordFactory.define({ a: null });
    const n1 = N.create();
    expect(n1.a).toBeNull();
    const n2 = RecordFactory.fork(n1, { a: null });
    expect(n1).toBe(n2);
  });

  it('should throw on invalid nested Record type', () => {
    const A = RecordFactory.define({ a: 1 });
    const B = RecordFactory.define({ b: A.create() });
    const invalid = { b: { a: 2 } }; // plain object, not Record
    expect(() => B.create(invalid as any)).toThrow(TypeError);
  });

  it('should create multiple instances independently', () => {
    const u1 = User.create({ id: 1 });
    const u2 = User.create({ id: 2 });
    expect(u1.id).toBe(1);
    expect(u2.id).toBe(2);
    expect(u1).not.toBe(u2);
  });

});
