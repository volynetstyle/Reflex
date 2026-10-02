import { describe, expect, it } from "vitest";
import { asyncDerived, pending } from "../src/unstable";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";
import { deferred } from "./async.contract-harness";
import type { Strategy } from "./async.contract-harness";

describe("async mutation witnesses", () => {
  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: pulls a changed parent before a cached committed read",
    (effectStrategy) => {
      const rt = createRuntime({ effectStrategy });
      const input = signal(1);
      const calls: string[] = [];
      const parent = asyncDerived(() => { calls.push("parent"); return input(); });
      const child = asyncDerived(({ read }) => { calls.push("child"); return read(parent) * 2; });
      const previous = child.commit()!;
      calls.length = 0;
      rt.batch(() => {
        input.set(2);
        // Parent input invalidation has not yet published into the child watcher.
        expect(child.commit()).toBe(previous);
        expect(child.read()).toBe(4);
        expect(calls).toEqual(["parent", "child"]);
      });
      rt.flush();
      expect(child.commit()!.version).toBe(previous.version + 1);
      expect(calls).toEqual(["parent", "child"]);
      child.dispose(); parent.dispose(); rt.flush();
    },
  );

  it("notifies pending expressions at terminal publication", async () => {
    const rt = createRuntime();
    const task = deferred<number>();
    const source = asyncDerived(() => task.promise);
    const waiting = computed(() => pending(() => source.read()));
    expect(waiting()).toBe(true);
    task.resolve(1); await task.promise; rt.flush();
    expect(waiting()).toBe(false);
    source.dispose();
  });

  it("aborts obsolete attempts before delivering their replacements", () => {
    createRuntime();
    const tasks = [deferred<number>(), deferred<number>()];
    let call = 0;
    const source = asyncDerived(() => tasks[call++]!.promise);
    const obsolete = source.attempt()!;
    source.refresh();
    expect(obsolete.signal.aborted).toBe(true);
    expect(obsolete.alive()).toBe(false);
    source.dispose(); tasks.forEach((task) => task.resolve(0));
  });

  it("obsolete settlement does not activate newly invalidated work", async () => {
    const rt = createRuntime();
    const input = signal(1);
    const tasks = [deferred<number>(), deferred<number>(), deferred<number>()];
    let calls = 0;
    const source = asyncDerived(() => { input(); return tasks[calls++]!.promise; });
    source.refresh();
    const current = source.attempt()!;
    input.set(2);
    // Do not read source metadata or flush here: those are legitimate activation paths.
    tasks[0]!.resolve(-1); await tasks[0]!.promise;
    expect(calls).toBe(2);
    expect(current.signal.aborted).toBe(false);
    rt.flush();
    expect(calls).toBe(3);
    expect(current.signal.aborted).toBe(true);
    source.dispose(); tasks.forEach((task) => task.resolve(0));
  });

  it("pulls dependencies before validation of a downstream publication", async () => {
    const rt = createRuntime();
    const input = signal(1);
    const parents = [deferred<number>(), deferred<number>()];
    const childTask = deferred<number>();
    const parent = asyncDerived(() => parents[input() - 1]!.promise);
    const child = asyncDerived(({ read }) => { read(parent); return childTask.promise; });
    parents[0]!.resolve(1); await parents[0]!.promise; rt.flush();
    const previous = child.attempt()!;
    input.set(2);
    childTask.resolve(-1); await childTask.promise;
    expect(child.commit()).toBeUndefined();
    expect(previous.signal.aborted).toBe(true);
    child.dispose(); parent.dispose(); parents[1]!.resolve(2);
  });
});

const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] as const;

describe("async dependency capture order", () => {
  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: validates first and additional dependencies in capture order before publication",
    (effectStrategy) => {
      const rt = createRuntime({ effectStrategy });
      const input = signal(1);
      const calls: string[] = [];
      // Scheduler registration order intentionally differs from async capture order.
      const c = asyncDerived(() => { calls.push("C"); return input() * 3; });
      const b = asyncDerived(() => { calls.push("B"); return input() * 2; });
      const a = asyncDerived(() => { calls.push("A"); return input(); });
      const child = asyncDerived(({ read }) => {
        calls.push("child");
        return read(a) + read(b) + read(a) + read(c) + read(b);
      });
      const version = child.commit()!.version;
      calls.length = 0;
      rt.batch(() => {
        input.set(2);
        expect(child.read()).toBe(18);
        expect(calls).toEqual(["A", "B", "C", "child"]);
      });
      rt.flush();
      expect(calls).toEqual(["A", "B", "C", "child"]);
      expect(child.commit()!.version).toBe(version + 1);
      child.dispose(); a.dispose(); b.dispose(); c.dispose(); rt.flush();
    },
  );
});

describe("multiple independently active blockers", () => {
  it.each(orders)("discovers sequential readiness under settlement order %j", async (...order) => {
    createRuntime();
    const tasks = [deferred<number>(), deferred<number>(), deferred<number>()];
    const starts = [0, 0, 0];
    const sources = tasks.map((task, index) => asyncDerived(() => { ++starts[index]!; return task.promise; }));
    const combined = asyncDerived(({ read }) => read(sources[0]!) + read(sources[1]!) + read(sources[2]!));
    const answer = combined.resolve();
    expect(starts).toEqual([1, 1, 1]);
    for (const index of order) {
      tasks[index]!.resolve(index + 1);
      await tasks[index]!.promise;
    }
    expect(await answer).toBe(6);
    expect(combined.commit()?.version).toBe(1);
    expect(starts).toEqual([1, 1, 1]);
    combined.dispose(); sources.forEach((source) => source.dispose());
  });
});

describe("diamond async graph", () => {
  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: changes one branch while both branches are blocked on A",
    async (effectStrategy) => {
      for (const switchBranch of [false, true]) {
        for (const bFirst of [false, true]) {
          const rt = createRuntime({ effectStrategy });
          const aTask = deferred<number>();
          const bTask = deferred<number>();
          const cTask = deferred<number>();
          const branch = signal(true);
          const a = asyncDerived(() => aTask.promise);
          const alternate = asyncDerived(() => 99);
          let bCalls = 0;
          let cCalls = 0;
          const b = asyncDerived(({ read }) => { read(branch() ? a : alternate); ++bCalls; return bTask.promise; });
          const c = asyncDerived(({ read }) => { read(a); ++cCalls; return cTask.promise; });
          const d = asyncDerived(({ read }) => [read(b), read(c)] as const);
          try {
            const oldB = b.attempt()!;
            const unchangedC = c.attempt()!;
            const answer = d.resolve();
            if (switchBranch) rt.batch(() => branch.set(false)); else b.refresh();
            b.attempt();
            expect(oldB.signal.aborted).toBe(true);
            expect(c.attempt()).toBe(unchangedC);
            expect(cCalls).toBe(0);
            if (bFirst) {
              bTask.resolve(switchBranch ? 109 : 11); await bTask.promise;
              expect(d.commit()).toBeUndefined();
              aTask.resolve(1); cTask.resolve(21);
            } else {
              aTask.resolve(1); await aTask.promise; rt.flush();
              cTask.resolve(21); await cTask.promise;
              expect(d.commit()).toBeUndefined();
              bTask.resolve(switchBranch ? 109 : 11);
            }
            expect(await answer).toEqual([switchBranch ? 109 : 11, 21]);
            expect(bCalls).toBe(1);
            expect(cCalls).toBe(1);
            expect(d.commit()?.version).toBe(1);
          } finally {
            d.dispose(); c.dispose(); b.dispose(); alternate.dispose(); a.dispose(); rt.flush();
            aTask.resolve(0); bTask.resolve(0); cTask.resolve(0);
            await Promise.resolve();
          }
        }
      }
    }, 10_000,
  );

  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: refresh/switch of one branch preserves the other branch's attempt",
    async (effectStrategy) => {
      for (let bits = 0; bits < 8; ++bits) {
        const rt = createRuntime({ effectStrategy });
        const rootTask = deferred<number>();
        const branch = signal(true);
        const bTasks = [deferred<number>(), deferred<number>()];
        const cTask = deferred<number>();
        const a = asyncDerived(() => rootTask.promise);
        const alternate = asyncDerived(() => 99);
        let bStarts = 0;
        let cStarts = 0;
        const bInputs: number[] = [];
        const b = asyncDerived(({ read }) => {
          bInputs.push(read(branch() ? a : alternate));
          return bTasks[bStarts++]!.promise;
        });
        const c = asyncDerived(({ read }) => { read(a); ++cStarts; return cTask.promise; });
        const d = asyncDerived(({ read }) => [read(b), read(c)] as const);
        const label = `${effectStrategy}: diamond ${bits}`;
        try {
          expect(pending(() => d.read()), label).toBe(true);
          rootTask.resolve(1); await rootTask.promise; rt.flush();
          const oldB = b.attempt()!;
          const oldC = c.attempt()!;
          if (bits & 1) rt.batch(() => branch.set(false)); else b.refresh();
          expect(pending(() => d.read()), label).toBe(true);
          expect(b.attempt()?.token, label).not.toBe(oldB.token);
          expect(oldB.signal.aborted, label).toBe(true);
          expect(c.attempt(), label).toBe(oldC);
          expect(cStarts, label).toBe(1);
          const answer = d.resolve();
          if (bits & 2) bTasks[0]!.reject(new Error("obsolete B")); else bTasks[0]!.resolve(-100);
          await bTasks[0]!.promise.catch(() => {});
          expect(d.commit(), label).toBeUndefined();
          if (bits & 4) {
            cTask.resolve(21); await cTask.promise;
            bTasks[1]!.resolve(bits & 1 ? 109 : 11);
          } else {
            bTasks[1]!.resolve(bits & 1 ? 109 : 11); await bTasks[1]!.promise;
            cTask.resolve(21);
          }
          expect(await answer, label).toEqual([bits & 1 ? 109 : 11, 21]);
          expect(d.commit()?.version, label).toBe(1);
          expect(bInputs, label).toEqual([1, bits & 1 ? 99 : 1]);
          expect(cStarts, label).toBe(1);
        } finally {
          d.dispose(); c.dispose(); b.dispose(); alternate.dispose(); a.dispose(); rt.flush();
          rootTask.resolve(0); cTask.resolve(0); bTasks.forEach((task) => task.resolve(0));
          await Promise.resolve();
        }
      }
    }, 10_000,
  );
});

describe("dependency removal and late settlement", () => {
  describe.each<Strategy>(["flush", "sab", "eager"])("%s scheduling", (effectStrategy) => {
    it.each(["success", "failure", "dispose"] as const)(
      "%s of removed A cannot restart or publish child after B commits",
      async (tail) => {
        const rt = createRuntime({ effectStrategy });
        const branch = signal(true);
        const tasks = [deferred<number>(), deferred<number>(), deferred<number>()];
        let aCalls = 0;
        const a = asyncDerived(() => tasks[aCalls++]!.promise);
        const b = asyncDerived(() => 5);
        let childCalls = 0;
        const child = asyncDerived(({ read }) => { ++childCalls; return read(branch() ? a : b); });
        const publications: unknown[] = [];
        const stop = effect(() => { publications.push(child.commit()); });
        rt.batch(() => branch.set(false)); rt.flush();
        expect(child.read()).toBe(5);
        const commit = child.commit();
        const calls = childCalls;
        const observed = publications.length;
        if (tail === "dispose") { a.dispose(); tasks[0]!.resolve(-100); }
        else if (tail === "failure") tasks[0]!.reject(new Error("removed dependency"));
        else tasks[0]!.resolve(-100);
        await tasks[0]!.promise.catch(() => {});
        rt.flush();
        expect(child.read()).toBe(5);
        expect(childCalls).toBe(calls);
        expect(child.commit()).toBe(commit);
        expect(publications).toHaveLength(observed);
        if (tail !== "dispose") {
          for (let index = 1; index < 3; ++index) {
            a.refresh(); tasks[index]!.resolve(-100 - index);
            await tasks[index]!.promise; rt.flush();
            expect(child.read()).toBe(5);
            expect(childCalls).toBe(calls);
            expect(child.commit()).toBe(commit);
            expect(publications).toHaveLength(observed);
          }
          a.dispose(); rt.flush();
          expect(childCalls).toBe(calls);
          expect(child.commit()).toBe(commit);
        }
        stop(); child.dispose(); b.dispose(); a.dispose(); rt.flush();
        tasks.forEach((task) => task.resolve(0));
      },
    );
  });
});
