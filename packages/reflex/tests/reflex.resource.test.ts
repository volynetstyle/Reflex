import { describe, expect, it } from "vitest";
import { withEffectCleanupRegistrar } from "../src/api/effect";
import { resource } from "../src/unstable";
import { createRuntime, signal } from "./reflex.test_utils";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("Reactive system - unstable resource protocol", () => {
  it("tracks status, value, error, and token through a request lifecycle", () => {
    const user = resource<number, string>();

    expect(user.status()).toBe("idle");
    expect(user.value()).toBeUndefined();
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(0);

    const request = user.start();

    expect(request.token).toBe(1);
    expect(request.alive()).toBe(true);
    expect(user.status()).toBe("pending");
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(1);

    expect(request.resolve(42)).toBe(true);
    expect(user.status()).toBe("resolved");
    expect(user.value()).toBe(42);
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(1);
  });

  it("keeps the last value and drops stale commits when a newer token wins", () => {
    const user = resource<number, string>();

    const first = user.start();
    expect(first.resolve(7)).toBe(true);

    const second = user.start();

    expect(user.status()).toBe("pending");
    expect(user.value()).toBe(7);
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(2);
    expect(first.alive()).toBe(false);
    expect(first.resolve(1)).toBe(false);
    expect(first.reject("stale")).toBe(false);

    expect(second.reject("boom")).toBe(true);
    expect(user.status()).toBe("rejected");
    expect(user.value()).toBe(7);
    expect(user.error()).toBe("boom");
    expect(user.token()).toBe(2);
  });

  it("invalidates in-flight work on clear and stays inert after disposal", () => {
    const user = resource<number, string>();
    const first = user.start();

    user.clear();

    expect(first.alive()).toBe(false);
    expect(first.resolve(10)).toBe(false);
    expect(user.status()).toBe("idle");
    expect(user.value()).toBeUndefined();
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(2);

    user.dispose();
    expect(user.status()).toBe("idle");
    expect(user.value()).toBeUndefined();
    expect(user.error()).toBeUndefined();
    expect(user.token()).toBe(3);

    const afterDispose = user.start();
    expect(afterDispose.token).toBe(3);
    expect(afterDispose.alive()).toBe(false);
    expect(afterDispose.resolve(20)).toBe(false);
    expect(afterDispose.reject("dead")).toBe(false);
    expect(user.token()).toBe(3);
  });

  it("registers disposal in the active cleanup registrar", () => {
    let cleanup: Destructor | undefined;

    const user = withEffectCleanupRegistrar((nextCleanup) => {
      cleanup = nextCleanup;
    }, () => resource<number>());

    const request = user.start();

    expect(typeof cleanup).toBe("function");
    expect(request.alive()).toBe(true);

    cleanup?.();

    expect(request.alive()).toBe(false);
    expect(user.status()).toBe("idle");
    expect(user.value()).toBeUndefined();
    expect(user.error()).toBeUndefined();
  });

  it("supports a no-source loader with runtime-scheduled refetch", async () => {
    const rt = createRuntime();
    let calls = 0;

    const user = resource(async () => {
      calls += 1;
      return calls;
    });

    expect(user.status()).toBe("pending");
    expect(user.token()).toBe(1);

    await Promise.resolve();

    expect(user.status()).toBe("resolved");
    expect(user.value()).toBe(1);

    user.refetch();
    expect(user.status()).toBe("resolved");

    rt.flush();
    expect(user.status()).toBe("pending");
    expect(user.token()).toBe(2);

    await Promise.resolve();

    expect(user.status()).toBe("resolved");
    expect(user.value()).toBe(2);
  });

  it("accepts function-like thenables from loaders", async () => {
    const thenable: PromiseLike<number> & (() => void) = Object.assign(
      () => undefined,
      {
        then(onFulfilled?: (value: number) => unknown) {
          return Promise.resolve(3).then(onFulfilled);
        },
      },
    );

    const user = resource(() => thenable);

    expect(user.status()).toBe("pending");
    expect(user.token()).toBe(1);

    await Promise.resolve();

    expect(user.status()).toBe("resolved");
    expect(user.value()).toBe(3);
    expect(user.error()).toBeUndefined();
  });

  it("tracks a reactive source and ignores stale async resolutions", async () => {
    const rt = createRuntime();
    const [id, setId] = signal(1);
    const pending = new Map<number, ReturnType<typeof deferred<string>>>();

    const user = resource(() => id(), (nextId) => {
      const task = deferred<string>();
      pending.set(nextId, task);
      return task.promise;
    });

    expect(user.status()).toBe("pending");
    expect(user.token()).toBe(1);

    setId(2);
    rt.flush();

    expect(user.status()).toBe("pending");
    expect(user.token()).toBe(2);

    pending.get(1)?.resolve("first");
    await Promise.resolve();

    expect(user.status()).toBe("pending");
    expect(user.value()).toBeUndefined();
    expect(user.error()).toBeUndefined();

    pending.get(2)?.resolve("second");
    await Promise.resolve();

    expect(user.status()).toBe("resolved");
    expect(user.value()).toBe("second");
    expect(user.error()).toBeUndefined();
  });
});
