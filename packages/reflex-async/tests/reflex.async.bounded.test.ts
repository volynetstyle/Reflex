import { describe, expect, it } from "vitest";
import { AsyncDisposedError, asyncDerived, pending } from "../src";
import { optimistic, transition } from "@volynets/reflex/unstable";
import { createRuntime, effect, signal } from "./reflex.test_utils";
import { deferred, runTrace, traces } from "./async.contract-harness";
import type { Seed, Strategy } from "./async.contract-harness";
describe("bounded async source contracts", () => {
  describe.each<Strategy>(["flush", "sab", "eager"])("%s scheduling", (strategy) => {
    it.each<Seed>(["absent", "value", "undefined"])(
      "%s initial commit: all 1,728 three-event traces match the reference model",
      async (seed) => {
        for (const trace of traces) await runTrace(strategy, seed, trace);
      }, 30_000,
    );
  });
});

describe("bounded nested blocker contracts", () => {
  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: all 64 combinations of switching, refreshing, disposal and late completion",
    async (effectStrategy) => {
      for (let bits = 0; bits < 64; ++bits) {
        const rt = createRuntime({ effectStrategy });
        const oldTask = deferred<number>();
        const newTask = deferred<number>();
        const alternateTask = deferred<number>();
        const childTask = deferred<number>();
        const id = signal(0);
        const branch = signal(true);
        const parent = asyncDerived(() => id() === 0 ? oldTask.promise : newTask.promise);
        const alternate = asyncDerived(() => alternateTask.promise);
        const child = asyncDerived(({ read }) => read(branch() ? parent : alternate) + 10);
        const leaf = asyncDerived(({ read }) => { read(child); return childTask.promise; });
        const originalAttempt = parent.attempt()!;
        const label = `${effectStrategy}: nested scenario ${bits}`;
        try {
          expect(pending(() => leaf.read()), label).toBe(true);
          if (bits & 1) child.refresh();
          rt.batch(() => id.set(1));
          if (bits & 2) rt.batch(() => branch.set(false));
          if (bits & 4) child.refresh();
          if (bits & 8) oldTask.reject(new Error("stale parent")); else oldTask.resolve(-100);
          await oldTask.promise.catch(() => {});
          newTask.resolve(3); alternateTask.resolve(3);
          // Validation must follow the selected upstream without depending on a flush.
          expect(await child.resolve(), label).toBe(13);
          expect(originalAttempt.alive(), label).toBe(false);
          expect(originalAttempt.signal.aborted, label).toBe(true);
          rt.flush();
          const oldLeaf = leaf.attempt()!;
          if (bits & 16) leaf.refresh();
          if (bits & 32) leaf.dispose();
          childTask.resolve(7);
          await childTask.promise;
          if (bits & 32) {
            expect(leaf.commit(), label).toBeUndefined();
            expect(() => leaf.read(), label).toThrow(AsyncDisposedError);
          } else {
            expect(await leaf.resolve(), label).toBe(7);
            expect(leaf.commit()?.version, label).toBe(1);
          }
          expect(oldLeaf.alive(), label).toBe(false);
        } finally {
          leaf.dispose(); child.dispose(); alternate.dispose(); parent.dispose(); rt.flush();
          oldTask.resolve(0); newTask.resolve(0); alternateTask.resolve(0); childTask.resolve(0);
          await Promise.resolve();
        }
      }
    }, 30_000,
  );
});

describe("bounded optimistic ownership contracts", () => {
  it.each<Strategy>(["flush", "sab", "eager"])(
    "%s: all 64 combinations of ownership order, equal truth, failures and continuation writes",
    async (effectStrategy) => {
      for (let bits = 0; bits < 64; ++bits) {
        const rt = createRuntime({ effectStrategy });
        const truth = signal("Alice");
        const [view, setView] = optimistic(() => truth());
        const tasks = { A: deferred<void>(), B: deferred<void>() };
        const writers = new Map<"A" | "B", typeof setView>();
        const completions = new Map<"A" | "B", Promise<boolean>>();
        let overlay: { owner: "A" | "B"; value: string } | undefined;
        const seen: string[] = [];
        const expected = ["Alice"];
        const stop = effect(() => { seen.push(view()); });
        const label = `${effectStrategy}: optimistic scenario ${bits}`;
        const check = (): void => {
          const visible = overlay?.value ?? truth();
          if (expected.at(-1) !== visible) expected.push(visible);
          rt.flush();
          expect(view(), label).toBe(visible);
          expect(seen, label).toEqual(expected);
        };
        const start = (owner: "A" | "B", value: string): void => {
          const completion = transition(async (scope) => {
            writers.set(owner, scope.bind(setView));
            setView(value);
            await tasks[owner].promise;
          }).then(() => true, () => false);
          completions.set(owner, completion);
          overlay = { owner, value };
          check();
        };
        const finish = async (owner: "A" | "B", reject: boolean): Promise<void> => {
          if (reject) tasks[owner].reject(new Error(`mutation ${owner} failed`));
          else tasks[owner].resolve();
          expect(await completions.get(owner), label).toBe(!reject);
          if (overlay?.owner === owner) overlay = undefined;
          check();
        };
        try {
          if (bits & 1) { start("B", "Carol"); start("A", "Bob"); }
          else { start("A", "Bob"); start("B", "Carol"); }
          truth.set(bits & 2 ? overlay!.value : "Server");
          check();
          const first = bits & 4 ? "B" : "A";
          const second = first === "A" ? "B" : "A";
          await finish(first, !!(bits & 8));
          expect(() => writers.get(first)!("invalid"), label).toThrow("already settled");
          if (bits & 32) {
            // A surviving owner's setter must still work after an async continuation.
            await Promise.resolve();
            writers.get(second)!("Dana");
            overlay = { owner: second, value: "Dana" };
            check();
          }
          await finish(second, !!(bits & 16));
          truth.set("Eve");
          check();
        } finally {
          tasks.A.resolve(); tasks.B.resolve();
          await Promise.all(completions.values());
          stop(); rt.flush();
        }
      }
    }, 30_000,
  );
});
