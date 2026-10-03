import { equal, same, ok, throws } from "./assertions";
import {
  asyncDerived,
  AsyncBlocker,
  AsyncDisposedError,
  createRuntime,
  derive,
  effect,
  evaluate,
  signal,
  unwrap,
} from "./entry";
import type { AsyncSource } from "../../src/index";
import type { Evaluation } from "./evaluation";
import {
  beforeDependencyValidation,
  beforePublicationValidation,
  getPublicationValidationCalls,
  resetValidationHooks,
  resetPublicationValidationCalls,
  untracked,
  variant,
} from "./entry";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function tick() {
  for (let i = 0; i < 8; ++i) await Promise.resolve();
}
/** Read again after a wake; validation can itself observe a transient blocker. */
async function fresh<T>(read: () => T): Promise<T> {
  let blocked: AsyncBlocker | undefined;
  for (let i = 0; i < 16; ++i) {
    try {
      return read();
    } catch (error) {
      if (!(error instanceof AsyncBlocker)) throw error;
      blocked = error;
      await tick();
    }
  }
  throw new Error("Still blocked after settlement and 16 read retries", {
    cause: blocked,
  });
}

export async function runCorpus(document: Document) {
  const results: Array<{
    name: string;
    strategy: string;
    passed: boolean;
    error?: string;
  }> = [];
  for (const strategy of ["flush", "sab", "eager"] as const) {
    const cases: Array<[string, (context: Context) => void | Promise<void>]> = [
      [
        "sync -> async -> sync",
        async ({ source, flush }) => {
          const input = signal(2);
          const a = source(async () => input() * 2);
          const b = derive(() => a.read() + 1);
          const c = derive(() => b() * 3);
          same(evaluate(c).kind, "blocked");
          await tick();
          flush();
          same(c(), 15);
          input.set(3);
          a.attempt();
          same(evaluate(c).kind, "blocked");
          await tick();
          flush();
          same(c(), 21);
        },
      ],
      [
        "async -> async",
        async ({ source }) => {
          const task = deferred<number>();
          const a = source(() => task.promise);
          const b = source(({ read }) => read(a) * 2);
          same(evaluate(b.read).kind, "blocked");
          task.resolve(4);
          await tick();
          same(b.read(), 8);
        },
      ],
      [
        "dynamic branch",
        async ({ source, flush }) => {
          const task = deferred<number>();
          const branch = signal(true);
          const a = source(() => task.promise);
          const b = source(() => 7);
          const selected = derive(() => (branch() ? a : b).read());
          same(evaluate(selected).kind, "blocked");
          branch.set(false);
          flush();
          same(selected(), 7);
          task.resolve(1);
          await tick();
          flush();
          same(selected(), 7);
        },
      ],
      [
        "superseded attempt",
        async ({ source }) => {
          const tasks = [deferred<number>(), deferred<number>()];
          let index = 0;
          const a = source(() => tasks[index]!.promise);
          const old = a.attempt()!;
          index = 1;
          a.refresh();
          ok(old.signal.aborted);
          tasks[1]!.resolve(2);
          await tick();
          same(a.read(), 2);
          const commit = a.commit();
          tasks[0]!.resolve(1);
          await tick();
          same(a.commit(), commit);
        },
      ],
      [
        "dependency changes while Promise resolves",
        async ({ source }) => {
          const input = signal(1);
          const tasks = [deferred<number>(), deferred<number>()];
          const a = source(() => tasks[input() - 1]!.promise);
          input.set(2);
          tasks[0]!.resolve(1);
          await tick();
          same(a.commit(), undefined);
          tasks[1]!.resolve(2);
          await tick();
          same(a.read(), 2);
        },
      ],
      [
        "block during validation",
        async ({ source }) => {
          const input = signal(false);
          const upstream = deferred<number>();
          const downstream = deferred<number>();
          const a = source(() => (input() ? upstream.promise : 1));
          const b = source(({ read }) => {
            read(a);
            return downstream.promise;
          });
          input.set(true);
          downstream.resolve(10);
          await tick();
          same(b.commit(), undefined);
          same(evaluate(b.read).kind, "blocked");
          upstream.resolve(2);
          await tick();
          same(await fresh(b.read), 10);
        },
      ],
      [
        "failure while stale commit exists",
        async ({ source, flush }) => {
          const task = deferred<number>();
          let first = true;
          const a = source(() => (first ? 5 : task.promise));
          const b = derive(() => a.read() * 2);
          same(b(), 10);
          const commit = a.commit();
          first = false;
          a.refresh();
          same(evaluate(b).kind, "blocked");
          const failure = new Error("data failure");
          task.reject(failure);
          await tick();
          flush();
          same(a.commit(), commit);
          const result = evaluate(b);
          same(result.kind, "error");
          if (result.kind === "error") same(result.error, failure);
        },
      ],
      [
        "refresh while consumer validates",
        ({ source }) => {
          let value = 1;
          const a = source(() => value);
          const b = derive(() => {
            value = 2;
            a.refresh();
            return a.read() * 2;
          });
          same(b(), 4);
          same(a.read(), 2);
        },
      ],
      [
        "dispose during completion",
        async ({ source }) => {
          const task = deferred<number>();
          const a = source(() => task.promise);
          const attempt = a.attempt()!;
          a.dispose();
          task.resolve(1);
          await tick();
          same(a.commit(), undefined);
          ok(attempt.signal.aborted);
          throws(a.read, AsyncDisposedError);
        },
      ],
      [
        "nested pending",
        async ({ source }) => {
          const task = deferred<number>();
          const a = source(() => task.promise);
          const b = derive(() => a.read() + 1);
          const c = derive(() => b() + 1);
          const d = source(() => c() + 1);
          same(evaluate(d.read).kind, "blocked");
          task.resolve(2);
          await tick();
          same(await fresh(d.read), 5);
        },
      ],
      ...[true, false].map(
        (bFirst): [string, (c: Context) => Promise<void>] => [
          `diamond async graph (${bFirst ? "B" : "C"} first)`,
          async ({ source }) => {
            const aTask = deferred<number>();
            const bTask = deferred<number>();
            const cTask = deferred<number>();
            const a = source(() => aTask.promise);
            const b = source(({ read }) => {
              const n = read(a);
              return bTask.promise.then((v) => n + v);
            });
            const c = source(({ read }) => {
              const n = read(a);
              return cTask.promise.then((v) => n + v);
            });
            const d = source(({ read }) => read(b) + read(c));
            aTask.resolve(1);
            await tick();
            b.attempt();
            c.attempt();
            (bFirst ? bTask : cTask).resolve(10);
            await tick();
            same(d.commit(), undefined);
            same(evaluate(d.read).kind, "blocked");
            (bFirst ? cTask : bTask).resolve(20);
            await tick();
            same(d.read(), 32);
          },
        ],
      ),
      [
        "computed chain -> DOM effect boundary",
        async ({ source, flush, stop }) => {
          const task = deferred<number>();
          const a = source(() => task.promise);
          const b = derive(() => a.read() * 2);
          const c = derive(() => b() + 1);
          const element = document.createElement("div");
          const seen: Array<string | number> = [];
          stop(
            effect(() => {
              const result = evaluate(c);
              seen.push(result.kind === "value" ? result.value : result.kind);
              element.textContent =
                result.kind === "value" ? String(result.value) : result.kind;
            }),
          );
          equal(seen, ["blocked"]);
          same(element.textContent, "blocked");
          task.resolve(2);
          await tick();
          flush();
          same(element.textContent, "5");
          equal(seen, ["blocked", 5]);
        },
      ],
      [
        "cached async -> sync -> async frontier",
        async ({ source }) => {
          const input = signal(1);
          const upstream = deferred<number>();
          const downstream = deferred<number>();
          const a = source(() => (input() === 1 ? 1 : upstream.promise));
          const b = derive(() => a.read() * 2);
          same(b(), 2); // warm outside an execution
          const d = source(() => {
            const n = b();
            return downstream.promise.then((v) => n + v);
          });
          input.set(2);
          downstream.resolve(10);
          await tick();
          same(
            d.commit(),
            undefined,
            "must validate the hidden upstream before publishing",
          );
          upstream.resolve(2);
          await tick();
          same(await fresh(d.read), 14);
        },
      ],
      [
        "blocker is wake-up, not value",
        async ({ source }) => {
          const task = deferred<number>();
          const a = source(() => task.promise);
          const result = evaluate(a.read);
          same(result.kind, "blocked");
          if (result.kind !== "blocked") throw new Error("Expected blocker");
          ok(result.blocker instanceof AsyncBlocker);
          a.refresh();
          same(await result.blocker.promise, undefined);
          same(evaluate(a.read).kind, "blocked");
          task.resolve(9);
          await tick();
          same(a.read(), 9);
        },
      ],
      [
        "committed undefined is present",
        ({ source }) => {
          const a = source(() => undefined);
          same(a.read(), undefined);
          ok(a.commit());
          same(a.commit()!.version, 1);
          same(evaluate(a.read).kind, "value");
          same(unwrap(evaluate(a.read)), undefined);
        },
      ],
      [
        "cached frontier dynamic removal",
        async ({ source }) => {
          const branch = signal(true);
          const input = signal(1);
          const task = deferred<number>();
          const a = source(() => (input() === 1 ? 1 : task.promise));
          const b = source(() => 7);
          const selected = derive(() => (branch() ? a : b).read());
          same(selected(), 1);
          branch.set(false);
          same(selected(), 7);
          const downstream = deferred<number>();
          const d = source(() => {
            const value = selected();
            return downstream.promise.then((n) => n + value);
          });
          input.set(2);
          a.attempt();
          downstream.resolve(10);
          await tick();
          same(await fresh(d.read), 17);
          const commit = d.commit();
          task.resolve(2);
          await tick();
          same(d.commit(), commit);
        },
      ],
      [
        "cached diamond frontier",
        async ({ source }) => {
          const input = signal(1);
          const task = deferred<number>();
          const a = source(() => (input() === 1 ? 1 : task.promise));
          const b = derive(() => a.read() * 2);
          const c = derive(() => a.read() * 3);
          same(b(), 2);
          same(c(), 3);
          const downstream = deferred<number>();
          const d = source(() => {
            const value = b() + c();
            return downstream.promise.then((n) => n + value);
          });
          input.set(2);
          downstream.resolve(10);
          await tick();
          same(
            d.commit(),
            undefined,
            "diamond must validate the shared hidden source",
          );
          task.resolve(2);
          await tick();
          same(await fresh(d.read), 20);
        },
      ],
      [
        "tagged source read matches throwing protocol",
        async ({ source }) => {
          const task = deferred<undefined>();
          let first = true;
          const a = source(() =>
            first ? undefined : task.promise,
          ) as AsyncSource<undefined> & {
            experimentalReadResult(): Evaluation<undefined>;
          };
          same(a.experimentalReadResult().kind, "value");
          first = false;
          a.refresh();
          const tagged = a.experimentalReadResult();
          const throwing = evaluate(a.read);
          same(tagged.kind, "blocked");
          same(throwing.kind, "blocked");
          if (tagged.kind === "blocked" && throwing.kind === "blocked")
            same(tagged.blocker, throwing.blocker);
          const failure = new Error("tagged failure");
          task.reject(failure);
          await tick();
          const failed = a.experimentalReadResult();
          same(failed.kind, "error");
          if (failed.kind === "error") same(failed.error, failure);
          ok(a.commit());
          same(a.commit()!.value, undefined);
          a.dispose();
          const disposed = a.experimentalReadResult();
          same(disposed.kind, "error");
          if (disposed.kind === "error")
            ok(disposed.error instanceof AsyncDisposedError);
        },
      ],
      [
        "B3 validates a shared diamond prerequisite once",
        async ({ source }) => {
          if (variant !== "B3") return;
          resetPublicationValidationCalls();
          const a = source(() => 1);
          const b = derive(() => a.read() + 1);
          const c = derive(() => a.read() + 2);
          same(b(), 2);
          same(c(), 3);
          const result = deferred<number>();
          const d = source(({ read }) => {
            const sum = b() + c();
            read(a);
            return result.promise.then((value) => value + sum);
          });
          d.attempt();
          const beforePublication = getPublicationValidationCalls();
          result.resolve(10);
          await tick();
          same(await fresh(d.read), 15);
          same(getPublicationValidationCalls() - beforePublication, 1);
        },
      ],
      [
        "B3 deep frontiers, many cached consumers, and repeated reads",
        async ({ source }) => {
          if (variant !== "B3") return;

          for (const depth of [16, 64, 256]) {
            const root = source(() => 1);
            let leaf: () => number = root.read;
            for (let i = 0; i < depth; ++i) {
              const previous = leaf;
              leaf = derive(() => previous() + 1);
            }
            const target = source(() => Promise.resolve(leaf()));
            await tick();
            same(await fresh(target.read), depth + 1);
            resetPublicationValidationCalls();
            target.refresh();
            await tick();
            same(await fresh(target.read), depth + 1);
            same(getPublicationValidationCalls(), 1);
          }

          const root = source(() => 5);
          const consumers = Array.from({ length: 96 }, (_, index) =>
            derive(() => root.read() + index),
          );
          consumers.forEach((consumer) => consumer());
          const expected = consumers.reduce((sum, consumer) => {
            const value = consumer();
            return sum + value + value;
          }, 0);
          const target = source(() =>
            Promise.resolve(
              consumers.reduce((sum, consumer) => {
                const first = consumer();
                return sum + first + consumer();
              }, 0),
            ),
          );
          await tick();
          same(await fresh(target.read), expected);
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(await fresh(target.read), expected);
          same(getPublicationValidationCalls(), 1);
        },
      ],
      [
        "B3 nested cached diamonds merge two async roots once each",
        async ({ source }) => {
          if (variant !== "B3") return;
          const leftRoot = source(() => 2);
          const rightRoot = source(() => 3);
          const left = derive(() => leftRoot.read() + rightRoot.read());
          const right = derive(() => leftRoot.read() * 2 + rightRoot.read());
          const middle = derive(() => left() + right());
          const upperLeft = derive(() => middle() * 3);
          const upperRight = derive(() => middle() + 7);
          const top = derive(() => upperLeft() + upperRight());
          same(top(), 55);

          const target = source(() => Promise.resolve(top() + top() + top()));
          await tick();
          same(await fresh(target.read), 165);
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(await fresh(target.read), 165);
          same(getPublicationValidationCalls(), 2);
        },
      ],
      [
        "B3 drops 90 percent of a dynamic frontier while old roots are pending",
        async ({ source }) => {
          if (variant !== "B3") return;
          const oldTasks = Array.from({ length: 9 }, () => deferred<number>());
          let oldRootsPending = false;
          const oldRoots = oldTasks.map((task, index) =>
            source(() => (oldRootsPending ? task.promise : index + 1)),
          );
          const kept = source(() => 10);
          const chooseMany = signal(true);
          const selected = derive(() =>
            chooseMany()
              ? oldRoots.reduce((sum, root) => sum + root.read(), 0)
              : kept.read(),
          );
          same(selected(), 45);

          oldRootsPending = true;
          chooseMany.set(false);
          oldRoots.forEach((root) => root.refresh());
          resetPublicationValidationCalls();
          const target = source(() => Promise.resolve(selected()));
          await tick();
          same(await fresh(target.read), 10);
          same(getPublicationValidationCalls(), 1);
        },
      ],
      [
        "B3 keeps an attempt frontier snapshot when a cached frontier mutates",
        async ({ source }) => {
          if (variant !== "B3") return;
          const oldTask = deferred<number>();
          let oldRootPending = false;
          const oldRoot = source(() => (oldRootPending ? oldTask.promise : 11));
          const newRoot = source(() => 11);
          const chooseOld = signal(true);
          const cached = derive(() =>
            chooseOld() ? oldRoot.read() : newRoot.read(),
          );
          same(cached(), 11);

          let waitForResult = false;
          const resultGate = deferred<void>();
          const target = source(() => {
            const observed = untracked(cached);
            return waitForResult
              ? resultGate.promise.then(() => observed)
              : Promise.resolve(observed);
          });
          await tick();
          same(await fresh(target.read), 11);
          const previousCommit = target.commit();
          waitForResult = true;
          oldRootPending = true;
          resetPublicationValidationCalls();
          beforePublicationValidation(() => {
            chooseOld.set(false);
            same(untracked(cached), 11);
            oldRoot.refresh();
          });
          target.refresh();
          resultGate.resolve();
          await tick();
          same(target.commit(), previousCommit);

          oldTask.resolve(11);
          await tick();
          same(await fresh(target.read), 11);
          ok(target.commit()!.version > previousCommit!.version);
          same(getPublicationValidationCalls(), 2);
        },
      ],
      [
        "B3 abandons a superseded attempt between collection and validation",
        async ({ source }) => {
          if (variant !== "B3") return;
          const root = source(() => 1);
          let invocations = 0;
          const target = source(({ read }) => {
            read(root);
            return Promise.resolve(++invocations);
          });
          await tick();
          same(await fresh(target.read), 1);

          beforePublicationValidation(() => target.refresh());
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(await fresh(target.read), 3);
          same(getPublicationValidationCalls(), 1);
        },
      ],
      [
        "B3 rechecks authority when validating one dependency invalidates another",
        async ({ source }) => {
          if (variant !== "B3") return;
          const left = source(() => 1);
          let rightValue = 1;
          const right = source(() => rightValue);
          const target = source(({ read }) =>
            Promise.resolve(read(left) + read(right)),
          );
          await tick();
          same(await fresh(target.read), 2);

          let invalidate = true;
          beforeDependencyValidation((dependency) => {
            if (invalidate && (dependency as unknown) === left) {
              invalidate = false;
              rightValue = 2;
              right.refresh();
            }
          });
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(await fresh(target.read), 3);
          same(getPublicationValidationCalls(), 4);
        },
      ],
      [
        "B3 blocks publication when validation starts a dependency attempt",
        async ({ source }) => {
          if (variant !== "B3") return;
          const next = deferred<number>();
          let pending = false;
          const root = source(() => (pending ? next.promise : 1));
          const target = source(({ read }) => Promise.resolve(read(root)));
          await tick();
          same(await fresh(target.read), 1);
          const previousCommit = target.commit();

          beforeDependencyValidation((dependency) => {
            if ((dependency as unknown) === root) {
              pending = true;
              root.refresh();
            }
          });
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(target.commit(), previousCommit);

          next.resolve(2);
          await tick();
          same(await fresh(target.read), 2);
          ok(target.commit()!.version > previousCommit!.version);
          ok(getPublicationValidationCalls() >= 2);
        },
      ],
      [
        "B3 propagates a failure raised during publication validation",
        async ({ source }) => {
          if (variant !== "B3") return;
          const failure = new Error("dependency failed during publication");
          let fail = false;
          const root = source(() => {
            if (fail) throw failure;
            return 1;
          });
          const target = source(({ read }) => Promise.resolve(read(root)));
          await tick();
          same(await fresh(target.read), 1);
          const previousCommit = target.commit();

          beforeDependencyValidation((dependency) => {
            if ((dependency as unknown) === root) {
              fail = true;
              root.refresh();
            }
          });
          resetPublicationValidationCalls();
          target.refresh();
          await tick();
          same(target.error(), failure);
          same(target.commit(), previousCommit);
          ok(getPublicationValidationCalls() >= 1);
        },
      ],
    ];
    for (const [name, run] of cases) {
      const runtime = createRuntime({ effectStrategy: strategy });
      const sources: AsyncSource<unknown>[] = [];
      const stops: Array<() => void> = [];
      const context: Context = {
        source(job) {
          const value = asyncDerived(job);
          sources.push(value);
          return value;
        },
        flush: () => runtime.flush(),
        stop: (fn) => stops.push(fn),
      };
      try {
        await run(context);
        results.push({ name, strategy, passed: true });
      } catch (error) {
        results.push({
          name,
          strategy,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        resetValidationHooks();
        stops.reverse().forEach((fn) => fn());
        sources.reverse().forEach((s) => s.dispose());
        runtime.flush();
        await tick();
      }
    }
  }
  return results;
}

interface Context {
  source<T>(job: Parameters<typeof asyncDerived<T>>[0]): AsyncSource<T>;
  flush(): void;
  stop(fn: () => void): void;
}
