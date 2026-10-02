import { describe, expect, it, vi } from "vitest";
import {
  AsyncBlocker,
  AsyncDisposedError,
  AsyncProtocolError,
  asyncDerived,
  currentOrUndefined,
  isLoading,
  isUpdating,
  optimistic,
  pending,
  read,
  transition,
  until,
} from "../src/unstable";
import type { AsyncExecution } from "../src/unstable";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("unstable async derivations", () => {
  it("shares nested notifications between resolve waiters and promoted public blockers", async () => {
    createRuntime();
    const task = deferred<number>();
    const parent = asyncDerived(() => task.promise);
    const child = asyncDerived(({ read }) => read(parent) + 1);
    const race = vi.spyOn(Promise, "race");
    try {
      const waiters = Array.from({ length: 16 }, () => child.resolve());
      expect(race).toHaveBeenCalledTimes(1);
      const capture = (): AsyncBlocker => {
        try { child.read(); } catch (error) {
          expect(error).toBeInstanceOf(AsyncBlocker);
          return error as AsyncBlocker;
        }
        throw new Error("Expected a blocker");
      };
      const blocker = capture();
      expect(blocker.promise).toBe(race.mock.results[0]!.value);
      expect(capture()).toBe(blocker);
      child.refresh();
      const replacement = capture();
      expect(replacement).not.toBe(blocker);
      expect(race).toHaveBeenCalledTimes(2);
      task.resolve(1);
      expect(await Promise.all(waiters)).toEqual(Array(16).fill(2));
      expect(child.read()).toBe(2);
      expect(race).toHaveBeenCalledTimes(2);
    } finally {
      race.mockRestore(); child.dispose(); parent.dispose(); task.resolve(0);
    }
  });

  it("waits on blockers thrown during upstream memo validation before the loader runs", async () => {
    const rt = createRuntime();
    const reload = signal(false);
    const task = deferred<number>();
    const parent = asyncDerived(() => reload() ? task.promise : 1);
    const projection = computed(() => parent.read() * 2);
    const child = asyncDerived(() => projection());
    expect(child.read()).toBe(2);
    reload.set(true); parent.attempt();
    const waiting = child.resolve();
    expect(child.commit()!.value).toBe(2);
    task.resolve(3);
    expect(await waiting).toBe(6);
    child.dispose(); parent.dispose(); rt.flush();
  });

  it("rejects a captured execution even while a newer attempt of the same source is running", () => {
    createRuntime();
    const upstream = asyncDerived(() => 1);
    let previous: AsyncExecution | undefined;
    const source = asyncDerived((execution) => {
      if (previous !== undefined) {
        expect(() => previous!.read(upstream)).toThrow(AsyncProtocolError);
        expect(() => previous!.commit(upstream)).toThrow(AsyncProtocolError);
      }
      previous = execution;
      const { read } = execution;
      return read(upstream);
    });
    source.refresh();
    expect(source.read()).toBe(1);
    expect(source.commit()!.version).toBe(2);
    source.dispose(); upstream.dispose();
  });

  it("preserves absent versus committed undefined inside an execution", async () => {
    const rt = createRuntime();
    const task = deferred<undefined>();
    const source = asyncDerived(() => task.promise);
    const decision = asyncDerived(({ commit }) => commit(source) === undefined ? "absent" : "present");
    expect(source.currentOrUndefined()).toBeUndefined();
    expect(decision.read()).toBe("absent");
    task.resolve(undefined); await task.promise; rt.flush();
    expect(source.currentOrUndefined()).toBeUndefined();
    expect(source.commit()).toMatchObject({ value: undefined, version: 1 });
    expect(decision.read()).toBe("present");
    decision.dispose(); source.dispose();
  });

  it.each(["read", "commit"] as const)("surfaces %s after await as a protocol violation, not data failure", async (method) => {
    createRuntime();
    const upstream = asyncDerived(() => 1);
    const source = asyncDerived(async (execution) => {
      await Promise.resolve();
      return execution[method](upstream);
    });
    await expect(source.resolve()).rejects.toBeInstanceOf(AsyncProtocolError);
    expect(() => source.read()).toThrow(AsyncProtocolError);
    expect(() => source.error()).toThrow(AsyncProtocolError);
    expect(() => pending(() => source.read())).toThrow(AsyncProtocolError);
    source.dispose(); upstream.dispose();
  });

  it("retains committed truth through a protocol failure and recovers on corrected retry", async () => {
    createRuntime();
    const upstream = asyncDerived(() => 1);
    let misuse = false;
    const source = asyncDerived((execution) => {
      if (!misuse) return 7;
      return Promise.resolve().then(() => execution.read(upstream));
    });
    misuse = true; source.refresh();
    await expect(source.resolve()).rejects.toBeInstanceOf(AsyncProtocolError);
    expect(source.currentOrUndefined()).toBe(7);
    expect(source.attempt()).toBeUndefined();
    misuse = false; source.refresh();
    expect(source.read()).toBe(7);
    expect(source.error()).toBeUndefined();
    source.dispose(); upstream.dispose();
  });

  it("does not let a superseded protocol failure replace newer truth", async () => {
    createRuntime();
    const upstream = asyncDerived(() => 1);
    const task = deferred<void>();
    let first = true;
    const source = asyncDerived((execution) => {
      if (!first) return 9;
      return task.promise.then(() => execution.read(upstream));
    });
    first = false; source.refresh(); task.resolve();
    await task.promise; await Promise.resolve();
    expect(source.read()).toBe(9);
    expect(source.error()).toBeUndefined();
    source.dispose(); upstream.dispose();
  });

  it("classifies a self dependency as a protocol violation", () => {
    const rt = createRuntime();
    const recursive = signal(false);
    let source!: ReturnType<typeof asyncDerived<number>>;
    source = asyncDerived(({ read }) => recursive() ? read(source) : 1);
    recursive.set(true); rt.flush();
    expect(() => source.error()).toThrow(AsyncProtocolError);
    recursive.set(false); rt.flush();
    expect(source.read()).toBe(1);
    source.dispose();
  });

  it("reuses the pending blocker and its promise within one source revision", async () => {
    createRuntime();
    const first = deferred<number>();
    const second = deferred<number>();
    let calls = 0;
    const source = asyncDerived(() => ++calls === 1 ? first.promise : second.promise);
    const capture = (): AsyncBlocker => {
      try { source.read(); } catch (error) {
        expect(error).toBeInstanceOf(AsyncBlocker);
        return error as AsyncBlocker;
      }
      throw new Error("Expected a blocker");
    };
    const original = capture();
    for (let i = 0; i < 32; ++i) expect(capture()).toBe(original);
    source.refresh();
    const replacement = capture();
    expect(replacement).not.toBe(original);
    expect(replacement.promise).not.toBe(original.promise);
    await original.promise;
    for (let i = 0; i < 32; ++i) expect(capture()).toBe(replacement);
    source.dispose(); await replacement.promise;
    first.resolve(1); second.resolve(2);
  });

  it("reuses a nested blocker race and wakes it on upstream progress", async () => {
    createRuntime();
    const task = deferred<number>();
    const parent = asyncDerived(() => task.promise);
    const child = asyncDerived(({ read }) => read(parent) + 1);
    const capture = (): AsyncBlocker => {
      try { child.read(); } catch (error) { return error as AsyncBlocker; }
      throw new Error("Expected a blocker");
    };
    const blocker = capture();
    for (let i = 0; i < 32; ++i) expect(capture()).toBe(blocker);
    task.resolve(4);
    await blocker.promise;
    expect(await child.resolve()).toBe(5);
    child.dispose(); parent.dispose();
  });

  it("makes the existing eager activation and first-blocker discovery explicit", async () => {
    const rt = createRuntime();
    const aTask = deferred<number>();
    const bTask = deferred<number>();
    const loadA = vi.fn(() => aTask.promise);
    const loadB = vi.fn(() => bTask.promise);
    const a = asyncDerived(loadA);
    const b = asyncDerived(loadB);
    expect(loadA).toHaveBeenCalledOnce();
    expect(loadB).toHaveBeenCalledOnce();
    let visitsB = 0;
    const combined = asyncDerived(({ read }) => {
      const first = read(a);
      ++visitsB;
      return first + read(b);
    });
    expect(visitsB).toBe(0);
    bTask.resolve(2); await bTask.promise; rt.flush();
    expect(visitsB).toBe(0);
    aTask.resolve(1);
    expect(await combined.resolve()).toBe(3);
    expect(visitsB).toBe(1);
    combined.dispose(); b.dispose(); a.dispose();
  });

  it.each([
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ])("keeps latest-attempt authority under settlement order %j", async (...order) => {
    createRuntime();
    const flights = [deferred<number>(), deferred<number>(), deferred<number>()];
    let call = 0;
    const source = asyncDerived(() => flights[call++]!.promise);
    source.refresh(); source.refresh();
    for (const index of order) {
      if (index === 1) {
        flights[index]!.reject(new Error("stale rejection"));
        await flights[index]!.promise.catch(() => {});
      } else {
        flights[index]!.resolve(index);
        await flights[index]!.promise;
      }
    }
    expect(source.read()).toBe(2);
    expect(source.error()).toBeUndefined();
    expect(source.commit()?.version).toBe(1);
    source.dispose();
  });

  it("replaces a blocked branch's dependencies when its selector changes", async () => {
    const rt = createRuntime();
    const branch = signal(true);
    const task = deferred<number>();
    const upstream = asyncDerived(() => task.promise);
    let calls = 0;
    const source = asyncDerived(({ read }) => { ++calls; return branch() ? read(upstream) : 5; });
    expect(pending(() => source.read())).toBe(true);
    branch.set(false); rt.flush();
    expect(source.read()).toBe(5);
    const previousCalls = calls;
    task.resolve(9); await task.promise; rt.flush();
    expect(calls).toBe(previousCalls);
    source.dispose(); upstream.dispose();
  });

  it("propagates upstream errors and recovers the composed derivation on retry", async () => {
    const rt = createRuntime();
    const task = deferred<number>();
    let retry = false;
    const upstream = asyncDerived(() => retry ? 3 : task.promise);
    const downstream = asyncDerived(({ read }) => read(upstream) * 2);
    const failure = new Error("upstream failed");
    task.reject(failure); await task.promise.catch(() => {}); rt.flush();
    expect(downstream.error()).toBe(failure);
    retry = true; upstream.refresh();
    expect(await downstream.resolve()).toBe(6);
    downstream.dispose(); upstream.dispose();
  });

  it.each(["flush", "sab", "eager"] as const)("restarts dependency work in %s scheduling mode", async (effectStrategy) => {
    const rt = createRuntime({ effectStrategy });
    const id = signal(1);
    const tasks = [deferred<number>(), deferred<number>()];
    const source = asyncDerived(() => tasks[id() - 1]!.promise);
    rt.batch(() => id.set(2)); rt.flush();
    tasks[0]!.resolve(1); tasks[1]!.resolve(2);
    expect(await source.resolve()).toBe(2);
    source.dispose();
  });

  it("separates commits from attempts, including a successful undefined", async () => {
    createRuntime();
    const task = deferred<undefined>();
    const source = asyncDerived(() => task.promise);
    const attempt = source.attempt()!;
    expect(source.commit()).toBeUndefined();
    expect(isLoading(source)).toBe(true);
    expect(isUpdating(source)).toBe(false);
    expect(() => read(source)).toThrow(AsyncBlocker);
    task.resolve(undefined);
    await task.promise;
    expect(source.commit()).toEqual({ value: undefined, version: 1, token: 1 });
    expect(read(source)).toBeUndefined();
    expect(attempt.alive()).toBe(false);
    source.refresh();
    expect(isLoading(source)).toBe(false);
    expect(isUpdating(source)).toBe(true);
    await until(source);
    source.dispose();
  });

  it("keeps committed truth visible while fresh reads block and errors propagate", async () => {
    createRuntime();
    const task = deferred<string>();
    let initial = true;
    const source = asyncDerived(() => initial ? "Alice" : task.promise);
    initial = false;
    source.refresh();
    expect(currentOrUndefined(source)).toBe("Alice");
    expect(isUpdating(source)).toBe(true);
    expect(() => read(source)).toThrow(AsyncBlocker);
    const failure = new Error("network");
    task.reject(failure);
    await task.promise.catch(() => {});
    expect(currentOrUndefined(source)).toBe("Alice");
    expect(source.error()).toBe(failure);
    expect(() => read(source)).toThrow(failure);
    expect(isUpdating(source)).toBe(false);
    await expect(until(source)).rejects.toBe(failure);
    source.dispose();
  });

  it("aborts A, commits B, and rejects a late A result that ignores abort", async () => {
    const rt = createRuntime();
    const id = signal(1);
    const a = deferred<string>();
    const b = deferred<string>();
    const source = asyncDerived(() => id() === 1 ? a.promise : b.promise);
    const old = source.attempt()!;
    id.set(2);
    rt.flush();
    expect(old.signal.aborted).toBe(true);
    expect(old.alive()).toBe(false);
    b.resolve("Bob");
    await b.promise;
    a.resolve("Alice");
    await a.promise;
    expect(read(source)).toBe("Bob");
    expect(source.commit()?.version).toBe(1);
    source.dispose();
  });

  it("validates dependencies before accepting a result, even before flush", async () => {
    createRuntime();
    const id = signal(1);
    const a = deferred<number>();
    const b = deferred<number>();
    const source = asyncDerived(() => id() === 1 ? a.promise : b.promise);
    id.set(2);
    a.resolve(1);
    await a.promise;
    expect(source.commit()).toBeUndefined();
    expect(source.attempt()?.token).toBe(2);
    b.resolve(2);
    expect(await until(source)).toBe(2);
    source.dispose();
  });

  it.each(["reject-first", "resolve-first"] as const)("ignores stale refresh failure: %s", async (order) => {
    createRuntime();
    const a = deferred<string>();
    const b = deferred<string>();
    const jobs = ["Alice", a.promise, b.promise];
    const source = asyncDerived(() => jobs.shift()!);
    source.refresh();
    source.refresh();
    if (order === "reject-first") {
      a.reject(new Error("stale"));
      await a.promise.catch(() => {});
      expect(currentOrUndefined(source)).toBe("Alice");
      expect(source.error()).toBeUndefined();
      b.resolve("Bob");
      await b.promise;
    } else {
      b.resolve("Bob");
      await b.promise;
      a.reject(new Error("stale"));
      await a.promise.catch(() => {});
    }
    expect(read(source)).toBe("Bob");
    expect(source.error()).toBeUndefined();
    source.dispose();
  });

  it("blocks user → company → permissions and resumes without a manual flush", async () => {
    createRuntime();
    const userTask = deferred<{ companyId: number }>();
    const companyTask = deferred<{ permission: string }>();
    const loadCompany = vi.fn((_companyId: number) => companyTask.promise);
    const user = asyncDerived(() => userTask.promise);
    const company = asyncDerived(({ read }) => loadCompany(read(user).companyId));
    const permissions = asyncDerived(({ read }) => read(company).permission);
    expect(company.attempt()?.blocker).toBeInstanceOf(AsyncBlocker);
    expect(loadCompany).not.toHaveBeenCalled();
    const answer = until(permissions);
    userTask.resolve({ companyId: 42 });
    companyTask.resolve({ permission: "admin" });
    expect(await answer).toBe("admin");
    expect(loadCompany).toHaveBeenCalledExactlyOnceWith(42);
    permissions.dispose(); company.dispose(); user.dispose();
  });

  it("supersedes downstream work when upstream changes again", async () => {
    const rt = createRuntime();
    const id = signal(1);
    const users = [deferred<number>(), deferred<number>(), deferred<number>()];
    const companies = new Map<number, ReturnType<typeof deferred<string>>>();
    const user = asyncDerived(() => users[id() - 1]!.promise);
    const company = asyncDerived(({ read }) => {
      const companyId = read(user);
      const task = deferred<string>();
      companies.set(companyId, task);
      return task.promise;
    });
    users[0]!.resolve(1);
    await users[0]!.promise;
    rt.flush();
    const firstCompany = company.attempt()!;
    id.set(2);
    rt.flush();
    expect(firstCompany.signal.aborted).toBe(true);
    users[1]!.resolve(2);
    await users[1]!.promise;
    rt.flush();
    const secondCompany = company.attempt()!;
    id.set(3);
    // Pulling company must also validate its upstream before the queued watcher runs.
    expect(() => read(company)).toThrow(AsyncBlocker);
    expect(secondCompany.signal.aborted).toBe(true);
    companies.get(1)!.resolve("stale 1");
    companies.get(2)!.resolve("stale 2");
    users[2]!.resolve(3);
    await users[2]!.promise;
    rt.flush();
    companies.get(3)!.resolve("current 3");
    expect(await until(company)).toBe("current 3");
    company.dispose(); user.dispose();
  });

  it("keeps current-only subscribers independent of attempt lifecycle", async () => {
    const rt = createRuntime();
    const task = deferred<number>();
    let calls = 0;
    const source = asyncDerived(() => ++calls === 1 ? 1 : task.promise);
    const seen: Array<number | undefined> = [];
    const stop = effect(() => { seen.push(currentOrUndefined(source)); });
    source.refresh();
    rt.flush();
    expect(seen).toEqual([1]);
    task.resolve(2);
    await task.promise;
    rt.flush();
    expect(seen).toEqual([1, 2]);
    stop(); source.dispose();
  });

  it("derives expression-relative pending without hiding failures", async () => {
    const rt = createRuntime();
    const select = signal(false);
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const waiting = computed(() => pending(() => select() ? read(source) : 7));
    expect(waiting()).toBe(false);
    select.set(true);
    expect(waiting()).toBe(true);
    task.resolve(4);
    await task.promise;
    expect(waiting()).toBe(false);
    const broken = asyncDerived(() => { throw new Error("ordinary error"); });
    expect(() => pending(() => read(broken))).toThrow("ordinary error");
    source.dispose(); broken.dispose(); rt.flush();
  });

  it("follows newer attempts in until and releases waiters on owner disposal", async () => {
    createRuntime();
    const owner = new AbortController();
    const a = deferred<number>();
    const b = deferred<number>();
    let calls = 0;
    const source = asyncDerived(() => ++calls === 1 ? a.promise : b.promise, { signal: owner.signal });
    const answer = until(source);
    source.refresh();
    b.resolve(2);
    expect(await answer).toBe(2);
    source.refresh();
    const attempt = source.attempt()!;
    const waiting = until(source);
    owner.abort();
    expect(attempt.signal.aborted).toBe(true);
    await expect(waiting).rejects.toBeInstanceOf(AsyncDisposedError);
    expect(currentOrUndefined(source)).toBe(2);
    source.refresh();
    expect(calls).toBe(3);
    a.resolve(1);
    await a.promise;
    expect(currentOrUndefined(source)).toBe(2);
  });

  it("does not execute a job under an already aborted owner", () => {
    createRuntime();
    const owner = new AbortController();
    owner.abort();
    const job = vi.fn(() => 1);
    const source = asyncDerived(job, { signal: owner.signal });
    expect(job).not.toHaveBeenCalled();
    expect(() => read(source)).toThrow(AsyncDisposedError);
  });

  it("can abort a waiter without canceling shared work", async () => {
    createRuntime();
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const owner = new AbortController();
    const waiting = until(source, { signal: owner.signal });
    const reason = new Error("wait canceled");
    owner.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(source.attempt()?.signal.aborted).toBe(false);
    task.resolve(8);
    expect(await until(source)).toBe(8);
    source.dispose();
  });

  it("rejects throwing and misbehaving thenables without multiple commits", async () => {
    createRuntime();
    const failure = new Error("then getter");
    const broken = Object.defineProperty({}, "then", { get() { throw failure; } });
    const rejected = asyncDerived(() => broken);
    expect(rejected.error()).toBe(failure);
    const strange = { then(yes: (value: number) => void, no: (error: unknown) => void) {
      yes(1); no("late"); yes(2);
    } } as PromiseLike<number>;
    const source = asyncDerived(() => strange);
    expect(await until(source)).toBe(1);
    expect(source.commit()?.version).toBe(1);
    source.dispose(); rejected.dispose();
  });

  it("rejects captured reactive reads after await", async () => {
    createRuntime();
    const upstream = asyncDerived(() => 1);
    const source = asyncDerived(async ({ read }) => { await Promise.resolve(); return read(upstream); });
    await expect(until(source)).rejects.toThrow("before await");
    source.dispose(); upstream.dispose();
  });

  it("supports a retry after a synchronous failure", () => {
    createRuntime();
    let fail = true;
    const source = asyncDerived(() => { if (fail) throw new Error("retry"); return 3; });
    expect(() => read(source)).toThrow("retry");
    fail = false;
    source.refresh();
    expect(read(source)).toBe(3);
    source.dispose();
  });

  it("publishes commit and activity together for eager observers", async () => {
    createRuntime({ effectStrategy: "eager" });
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const seen: unknown[] = [];
    const stop = effect(() => { seen.push([source.commit()?.value, source.attempt()?.token]); });
    task.resolve(2);
    await task.promise;
    expect(seen).toEqual([[undefined, 1], [2, undefined]]);
    stop(); source.dispose();
  });

  it("preserves the owning runtime during async settlement", async () => {
    const first = createRuntime();
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const seen: Array<number | undefined> = [];
    const stop = effect(() => { seen.push(currentOrUndefined(source)); });
    const second = createRuntime();
    task.resolve(4);
    await task.promise;
    second.flush();
    expect(seen).toEqual([undefined]);
    first.flush();
    expect(seen).toEqual([undefined, 4]);
    stop(); source.dispose();
  });

  it("keeps Carol visible when Bob's older transition settles", async () => {
    const rt = createRuntime();
    const authoritative = signal("Alice");
    const [view, setView] = optimistic(() => authoritative());
    const a = deferred<void>();
    const b = deferred<void>();
    const seen: string[] = [];
    const stop = effect(() => { seen.push(view()); });
    const first = transition(async () => { setView("Bob"); await a.promise; });
    rt.flush();
    authoritative.set("Bob");
    const second = transition(async () => { setView("Carol"); await b.promise; });
    rt.flush();
    a.resolve(); await first; rt.flush();
    expect(view()).toBe("Carol");
    authoritative.set("Carol");
    b.resolve(); await second; rt.flush();
    authoritative.set("Dana"); rt.flush();
    expect(seen).toEqual(["Alice", "Bob", "Carol", "Dana"]);
    stop();
  });
});
