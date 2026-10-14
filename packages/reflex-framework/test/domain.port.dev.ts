import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createExecutionDomain,
  readConsumer,
  untracked,
} from "@volynets/reflex-runtime";
import { createManagedRoot, createPort } from "../src";

describe("domain ports (DEV contract checks)", () => {
  it("deep-freezes published payloads under the immutable contract", () => {
    const a = createManagedRoot(createExecutionDomain());
    const b = createManagedRoot(createExecutionDomain());
    const port = createPort<{ nested: { items: number[] } }>(a, b);
    const value = { nested: { items: [1] } };

    a.run(() => port.publish(value));

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested.items)).toBe(true);
    expect(() => value.nested.items.push(2)).toThrow(TypeError);
  });

  it("tracks the mirror only inside its target domain", () => {
    const a = createManagedRoot(createExecutionDomain());
    const b = createManagedRoot(createExecutionDomain());
    const port = createPort<number>(a, b);
    port.deliver({ version: 1, value: 1 });
    const fromSource = createConsumer(() => port.read());

    expect(() => a.run(() => readConsumer(fromSource))).toThrow(
      /target domain/,
    );
    expect(a.run(() => untracked(() => port.read()))).toBe(1);
    expect(b.run(() => readConsumer(createConsumer(() => port.read())))).toBe(
      1,
    );
  });
});
