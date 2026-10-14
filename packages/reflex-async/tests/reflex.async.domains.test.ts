import { describe, expect, it } from "vitest";
import {
  createExecutionDomain,
  createWatcher,
  currentConsumer,
  getActiveRuntimeContext,
  runWatcher,
} from "@volynets/reflex-runtime/internal";
import { AsyncDisposedError, asyncDerived } from "../src";
import { createRuntime, effect, signal } from "./reflex.test_utils";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("async authority across execution domains (PR-07)", () => {
  it("never publishes into a domain closed mid-request", async () => {
    const request = createExecutionDomain();
    const task = deferred<number>();
    let jobAborted = false;
    const source = request.run(() =>
      asyncDerived(({ signal }) => {
        signal.addEventListener("abort", () => (jobAborted = true));
        return task.promise;
      }),
    );

    request.close();
    expect(jobAborted).toBe(true);
    task.resolve(1);
    await tick();

    expect(source.commit()).toBeUndefined();
    expect(() => source.read()).toThrow(AsyncDisposedError);
  });

  it("is disposed when created inside an already closed domain", () => {
    const domain = createExecutionDomain();
    domain.run(() => {
      domain.close();
      const source = asyncDerived(() => 1);
      expect(source.commit()).toBeUndefined();
      expect(() => source.read()).toThrow(AsyncDisposedError);
    });
  });

  it("commits a completion settled before the close, then disposes", async () => {
    const domain = createExecutionDomain();
    const task = deferred<number>();
    const source = domain.run(() => asyncDerived(() => task.promise));

    task.resolve(5);
    await tick();
    expect(source.commit()?.value).toBe(5);

    domain.close();
    expect(() => source.read()).toThrow(AsyncDisposedError);
    expect(source.commit()?.value).toBe(5);
  });

  it("drops a completion that races an abort in the same turn", async () => {
    const domain = createExecutionDomain();
    const task = deferred<number>();
    const source = domain.run(() => asyncDerived(() => task.promise));

    task.resolve(9);
    domain.close();
    await tick();

    expect(source.commit()).toBeUndefined();
  });

  it("publishes inside the captured domain, wherever the promise settles", async () => {
    const a = createExecutionDomain();
    const b = createExecutionDomain();
    const task = deferred<number>();
    let publishedIn: unknown;
    const source = a.run(() => asyncDerived(() => task.promise));
    const observer = a.run(() =>
      asyncDerived(({ read }) => {
        publishedIn = getActiveRuntimeContext();
        return read(source) * 2;
      }),
    );

    b.run(() => task.resolve(4));
    await tick();

    expect(await observer.resolve()).toBe(8);
    expect(publishedIn).toBe(a.context);
    expect(a.depth).toBe(0);
  });

  it("disposes in its own domain when disposal starts in another", () => {
    const invalidatedIn: string[] = [];
    const a = createExecutionDomain({
      hooks: { onNodeInvalidated: () => void invalidatedIn.push("a") },
    });
    const b = createExecutionDomain({
      hooks: { onNodeInvalidated: () => void invalidatedIn.push("b") },
    });
    const source = a.run(() =>
      asyncDerived(() => new Promise<number>(() => {})),
    );
    a.run(() => runWatcher(createWatcher(() => void source.snapshot())));
    invalidatedIn.length = 0;

    b.run(() => source.dispose());

    expect(() => source.read()).toThrow(AsyncDisposedError);
    expect(invalidatedIn).toContain("a");
    expect(invalidatedIn).not.toContain("b");
  });

  it("supersedes stale overlapping attempts after a domain re-entry", async () => {
    const runtime = createRuntime();
    const query = signal(1);
    const tasks = new Map<number, ReturnType<typeof deferred<number>>>();
    const source = runtime.domain.run(() =>
      asyncDerived(() => {
        const key = query();
        const task = deferred<number>();
        tasks.set(key, task);
        return task.promise;
      }),
    );
    source.attempt();
    query.set(2);
    source.attempt();

    tasks.get(2)!.resolve(20);
    tasks.get(1)!.resolve(10);
    await tick();

    expect(source.commit()?.value).toBe(20);
    source.dispose();
  });

  it("never carries the tracking consumer across await", async () => {
    createRuntime();
    const gate = deferred<void>();
    let afterAwait: unknown = "unset";
    const source = asyncDerived(async () => {
      await gate.promise;
      afterAwait = currentConsumer;
      return 1;
    });
    const seen: number[] = [];
    const stop = effect(() => {
      const value = source.currentOrUndefined();
      if (value !== undefined) seen.push(value);
    });

    gate.resolve();
    await tick();

    expect(afterAwait).toBeNull();
    stop();
    source.dispose();
  });
});
