import { describe, expect, it, vi } from "vitest";
import { AsyncBlocker, AsyncDisposedError, AsyncProtocolError, asyncDerived, until } from "../src";
import { createEvaluatedComputed } from "../src/async/evaluation";
import { waitForChange } from "../src/async/wait";
import { createRuntime, signal } from "./reflex.test_utils";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("async review regressions", () => {
  it.each(["flush", "sab", "eager"] as const)(
    "%s: publishes caught failures through direct and cached reads and recovers", async (effectStrategy) => {
      const runtime = createRuntime({ effectStrategy });
      const fail = signal(true);
      const upstream = asyncDerived<number>(() => { if (fail()) throw undefined; return 7; });
      const fallback = () => { try { return upstream.read(); } catch { return 42; } };
      const cached = createEvaluatedComputed(createEvaluatedComputed(fallback));
      expect(cached()).toBe(42);
      const direct = asyncDerived(fallback);
      const inherited = asyncDerived(cached);
      const asynchronous = asyncDerived(async () => cached());
      try {
        expect(direct.read()).toBe(42);
        expect(inherited.read()).toBe(42);
        expect(await asynchronous.resolve()).toBe(42);
        fail.set(false);
        expect(await direct.resolve()).toBe(7);
        expect(await inherited.resolve()).toBe(7);
        expect(await asynchronous.resolve()).toBe(7);
      } finally {
        asynchronous.dispose(); inherited.dispose(); direct.dispose(); upstream.dispose(); runtime.flush();
      }
    },
  );

  it.each(["flush", "sab", "eager"] as const)(
    "%s: replaces an in-flight fallback when the observed failure changes", async (effectStrategy) => {
      const runtime = createRuntime({ effectStrategy });
      const error = signal<unknown>(new Error("first"));
      const upstream = asyncDerived<number>(() => { throw error(); });
      const tasks: Array<ReturnType<typeof deferred<unknown>>> = [];
      const downstream = asyncDerived(() => {
        let observed: unknown;
        try { upstream.read(); } catch (caught) { observed = caught; }
        const task = deferred<unknown>();
        tasks.push(task);
        return task.promise.then(() => observed);
      });
      try {
        const obsolete = downstream.attempt()!;
        const replacement = new Error("second");
        error.set(replacement);
        tasks[0]!.resolve(null);
        await tasks[0]!.promise;
        await Promise.resolve();
        downstream.attempt();
        expect(obsolete.alive()).toBe(false);
        expect(downstream.commit()).toBeUndefined();
        tasks.at(-1)!.resolve(null);
        expect(await downstream.resolve()).toBe(replacement);
      } finally { downstream.dispose(); upstream.dispose(); runtime.flush(); }
    },
  );

  it("preserves a user-transformed error instead of substituting the upstream failure", async () => {
    createRuntime();
    const upstream = asyncDerived<number>(() => { throw new Error("offline"); });
    const transformed = new Error("handled");
    const downstream = asyncDerived(() => { try { return upstream.read(); } catch { throw transformed; } });
    try { await expect(downstream.resolve()).rejects.toBe(transformed); }
    finally { downstream.dispose(); upstream.dispose(); }
  });

  it("keeps caught pending reads pending until the captured source settles", async () => {
    createRuntime();
    const task = deferred<number>();
    const upstream = asyncDerived(() => task.promise);
    const downstream = asyncDerived(() => { try { return upstream.read(); } catch { return 42; } });
    try {
      expect(downstream.read).toThrow(AsyncBlocker);
      expect(downstream.commit()).toBeUndefined();
      task.resolve(7);
      expect(await downstream.resolve()).toBe(7);
    } finally { downstream.dispose(); upstream.dispose(); }
  });

  it("publishes a fallback for an already disposed source", () => {
    createRuntime();
    const upstream = asyncDerived(() => 7);
    upstream.dispose();
    const downstream = asyncDerived(() => {
      try { return upstream.read(); }
      catch (error) { expect(error).toBeInstanceOf(AsyncDisposedError); return 42; }
    });
    try { expect(downstream.read()).toBe(42); }
    finally { downstream.dispose(); }
  });

  it("rejects a new failure during publication after capturing a successful read", async () => {
    createRuntime();
    let failure = false;
    const upstream = asyncDerived(() => { if (failure) throw new Error("new failure"); return 7; });
    const task = deferred<number>();
    const downstream = asyncDerived(({ read }) => { read(upstream); return task.promise; });
    const validate = vi.spyOn(upstream as import("../src").AsyncCore<number>, "validate").mockImplementation(() => {
      failure = true;
      upstream.refresh();
      throw new Error("new failure");
    });
    try {
      task.resolve(42);
      await expect(downstream.resolve()).rejects.toThrow("new failure");
      expect(downstream.commit()).toBeUndefined();
    } finally { validate.mockRestore(); downstream.dispose(); upstream.dispose(); }
  });

  it("rejects a pending direct read after await instead of leaving an immortal attempt", async () => {
    createRuntime();
    const task = deferred<number>();
    const upstream = asyncDerived(() => task.promise);
    const downstream = asyncDerived(async () => { await Promise.resolve(); return upstream.read(); });
    try {
      await Promise.resolve(); await Promise.resolve();
      expect(downstream.error).toThrow(AsyncProtocolError);
      await expect(downstream.resolve()).rejects.toBeInstanceOf(AsyncProtocolError);
      task.resolve(7);
      expect(await upstream.resolve()).toBe(7);
      expect(downstream.error).toThrow(AsyncProtocolError);
    } finally { downstream.dispose(); upstream.dispose(); }
  });

  it("retries a synchronous blocking read inside an async function", async () => {
    createRuntime();
    const task = deferred<number>();
    const upstream = asyncDerived(() => task.promise);
    const downstream = asyncDerived(async ({ read }) => read(upstream) + 1);
    try { task.resolve(7); expect(await downstream.resolve()).toBe(8); }
    finally { downstream.dispose(); upstream.dispose(); }
  });

  it("distinguishes a thrown undefined from a committed undefined through read and resolve", async () => {
    createRuntime();
    const failed = asyncDerived(() => { throw undefined; });
    const ready = asyncDerived(() => undefined);
    try {
      expect(failed.error()).toBeUndefined();
      expect(ready.error()).toBeUndefined();
      await expect(failed.resolve()).rejects.toBeUndefined();
      expect(ready.read()).toBeUndefined();
      expect(ready.commit()).toMatchObject({ value: undefined, version: 1 });
    } finally { failed.dispose(); ready.dispose(); }
  });

  it.each(["resolve", "until"] as const)("%s cancels only its waiter, leaving the source and other waiters alive", async (method) => {
    createRuntime();
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const cancelled = method === "resolve" ? source.resolve({ signal: controller.signal }) : until(source, { signal: controller.signal });
    const rejected = expect(cancelled).rejects.toBe(reason);
    const survivor = source.resolve({ signal: new AbortController().signal });
    controller.abort(reason);
    await rejected;
    expect(source.attempt()!.alive()).toBe(true);
    task.resolve(7);
    expect(await survivor).toBe(7);
    source.dispose();
  });

  it("bounds promise reactions during repeated cancellation of one pending notification", async () => {
    const task = deferred<void>();
    const then = vi.spyOn(task.promise, "then");
    for (let i = 0; i < 64; ++i) {
      const controller = new AbortController();
      const waiting = waitForChange(task.promise, controller.signal).catch(() => {});
      controller.abort();
      await waiting;
    }
    expect(then).toHaveBeenCalledTimes(1);
    const surviving = waitForChange(task.promise, new AbortController().signal);
    task.resolve();
    await surviving;
    await waitForChange(task.promise, new AbortController().signal);
    then.mockRestore();
  });

  it("wakes abortable waiters on notification rejection and source disposal", async () => {
    const task = deferred<void>();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const waiting = waitForChange(task.promise, controller.signal);
    task.reject(new Error("changed"));
    await waiting;
    expect(remove).toHaveBeenCalledOnce();
    createRuntime();
    const source = asyncDerived(() => new Promise<number>(() => {}));
    const resolved = expect(source.resolve({ signal: controller.signal })).rejects.toBeInstanceOf(AsyncDisposedError);
    source.dispose();
    await resolved;
  });
});
