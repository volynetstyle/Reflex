import { afterAll, bench, describe } from "vitest";
import { createRuntime, signal } from "@volynets/reflex";
import { asyncDerived } from "../src";

describe("async source lifecycle", () => {
  createRuntime();

  bench("create / synchronous commit / dispose", () => {
    const source = asyncDerived(() => 1);
    source.read();
    source.dispose();
  });

  bench("create / promise settlement / dispose", async () => {
    const source = asyncDerived(() => Promise.resolve(1));
    await source.resolve();
    source.dispose();
  });
});

describe("async source reads and invalidation", () => {
  const runtime = createRuntime();
  const input = signal(0);
  const source = asyncDerived(() => input());
  const downstream = asyncDerived(({ read }) => read(source) + 1);
  downstream.read();
  afterAll(() => {
    downstream.dispose();
    source.dispose();
  });

  bench("cached committed read", () => {
    source.commit();
  });
  bench("cached fresh read", () => {
    source.read();
  });
  bench("invalidate / flush / downstream fresh read", () => {
    input.set(input() + 1);
    runtime.flush();
    downstream.read();
  });
});
