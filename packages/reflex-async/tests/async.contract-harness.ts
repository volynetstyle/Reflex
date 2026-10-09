import { expect } from "vitest";
import { AsyncBlocker, AsyncDisposedError, asyncDerived } from "../src";
import type { AsyncCommit } from "../src";
import { createRuntime, effect, signal } from "./reflex.test_utils";
type Value = number | undefined;
export type Seed = "absent" | "value" | "undefined";
export type Strategy = "flush" | "sab" | "eager";
export type Event = typeof events[number];
export const events = [
  "refresh", "switch", "change-left", "change-right", "resolve-newest",
  "reject-newest", "resolve-oldest", "reject-oldest", "equal-commit",
  "dispose", "owner-abort", "switch-and-late-settle",
] as const;

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Flight {
  readonly token: number;
  readonly input: number;
  settled: boolean;
}

/** Reference semantics: plain records, no reactive nodes, watchers or runtime flags. */
class ReferenceSource {
  branch = true;
  left = 1;
  right = 2;
  disposed = false;
  dirty = false;
  token = 0;
  attempt: Flight | undefined;
  commit: AsyncCommit<Value> | undefined;
  failure: Error | undefined;
  readonly flights: Flight[] = [];
  readonly visible: Value[];
  readonly publications: Array<AsyncCommit<Value> | undefined>;

  constructor(private readonly seed: Seed) {
    this.start();
    this.visible = [this.commit?.value];
    this.publications = [this.commit];
  }

  private start(): void {
    if (this.disposed) return;
    this.dirty = false;
    this.failure = undefined;
    const token = ++this.token;
    if (token === 1 && this.seed !== "absent") {
      this.commit = { value: this.seed === "value" ? 5 : undefined, version: 1, token };
      return;
    }
    this.attempt = { token, input: this.branch ? this.left : this.right, settled: false };
    this.flights.push(this.attempt);
  }

  ensure(): void {
    if (this.dirty && !this.disposed) this.start();
  }

  refresh(): void {
    if (!this.disposed) this.start();
  }

  select(): void {
    this.branch = !this.branch;
    if (!this.disposed) this.dirty = true;
  }

  changeLeft(): void {
    ++this.left;
    if (this.branch && !this.disposed) this.dirty = true;
  }

  changeRight(): void {
    ++this.right;
    if (!this.branch && !this.disposed) this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    this.attempt = undefined;
    this.failure = undefined;
    this.dirty = false;
  }

  choose(oldest: boolean): Flight | undefined {
    return oldest ? this.flights.find((flight) => !flight.settled) :
      [...this.flights].reverse().find((flight) => !flight.settled);
  }

  settle(flight: Flight, value: Value, failure?: Error): void {
    flight.settled = true;
    if (this.disposed || flight !== this.attempt) return;
    // The original attempt may become obsolete while validating changed inputs.
    this.ensure();
    if (flight !== this.attempt) return;
    this.attempt = undefined;
    if (failure !== undefined) {
      this.failure = failure;
    } else {
      this.commit = { value, version: (this.commit?.version ?? 0) + 1, token: flight.token };
      this.publications.push(this.commit);
      if (!Object.is(this.visible.at(-1), value)) this.visible.push(value);
    }
  }
}

export const traces: Event[][] = events.flatMap((a) => events.flatMap((b) =>
  events.map((c) => [a, b, c])));

export async function runTrace(strategy: Strategy, seed: Seed, trace: readonly Event[]): Promise<void> {
  const rt = createRuntime({ effectStrategy: strategy });
  const owner = new AbortController();
  const branch = signal(true);
  const left = signal(1);
  const right = signal(2);
  const tasks = new Map<number, ReturnType<typeof deferred<Value>> & { input: number }>();
  const source = asyncDerived<Value>((execution) => {
    const input = branch() ? left() : right();
    if (execution.attempt.token === 1 && seed !== "absent") {
      return seed === "value" ? 5 : undefined;
    }
    const task = { ...deferred<Value>(), input };
    tasks.set(execution.attempt.token, task);
    return task.promise;
  }, { signal: owner.signal });
  const reference = new ReferenceSource(seed);
  const visible: Value[] = [];
  const publications: Array<AsyncCommit<Value> | undefined> = [];
  const stopView = effect(() => { visible.push(source.currentOrUndefined()); });
  const stopCommits = effect(() => { publications.push(source.commit()); });
  const attempts = new Map<number, ReturnType<typeof source.attempt>>();

  const check = (step: number): void => {
    const label = `${strategy}/${seed}: ${trace.join(" → ")} (step ${step})`;
    reference.ensure();
    const attempt = source.attempt();
    if (attempt !== undefined) attempts.set(attempt.token, attempt);
    rt.flush();
    expect(source.commit(), label).toEqual(reference.commit);
    expect(source.currentOrUndefined(), label).toBe(reference.commit?.value);
    expect(attempt?.token, label).toBe(reference.attempt?.token);
    expect(source.error(), label).toBe(reference.failure);
    expect([...tasks].map(([token, task]) => [token, task.input]), label)
      .toEqual(reference.flights.map((flight) => [flight.token, flight.input]));
    expect(visible, label).toEqual(reference.visible);
    expect(publications, label).toEqual(reference.publications);
    for (const [token, previous] of attempts) {
      expect(previous?.alive(), label).toBe(reference.attempt?.token === token);
    }
    let result: Value;
    try {
      result = source.read();
    } catch (error) {
      if (reference.disposed) { expect(error, label).toBeInstanceOf(AsyncDisposedError); return; }
      if (reference.failure !== undefined) { expect(error, label).toBe(reference.failure); return; }
      expect(error, label).toBeInstanceOf(AsyncBlocker);
      expect(reference.attempt, label).toBeDefined();
      return;
    }
    expect(reference.disposed || reference.failure !== undefined || reference.attempt !== undefined, label).toBe(false);
    expect(result, label).toBe(reference.commit?.value);
  };

  const settle = async (flight: Flight | undefined, reject: boolean, equal = false): Promise<void> => {
    if (flight === undefined) return;
    const task = tasks.get(flight.token)!;
    const value = equal ? reference.commit?.value : flight.input;
    const failure = reject ? new Error(`request ${flight.token} failed`) : undefined;
    reference.settle(flight, value, failure);
    if (failure === undefined) task.resolve(value); else task.reject(failure);
    // The source's settlement handler was registered before this observer.
    await task.promise.catch(() => {});
  };

  try {
    check(0);
    for (const [step, event] of trace.entries()) {
      switch (event) {
        case "refresh": reference.refresh(); source.refresh(); break;
        case "switch": reference.select(); rt.batch(() => branch.set(!branch())); break;
        case "change-left": reference.changeLeft(); rt.batch(() => left.set(left() + 1)); break;
        case "change-right": reference.changeRight(); rt.batch(() => right.set(right() + 1)); break;
        case "resolve-newest": await settle(reference.choose(false), false); break;
        case "reject-newest": await settle(reference.choose(false), true); break;
        case "resolve-oldest": await settle(reference.choose(true), false); break;
        case "reject-oldest": await settle(reference.choose(true), true); break;
        case "equal-commit": await settle(reference.choose(false), false, true); break;
        case "dispose": reference.dispose(); source.dispose(); break;
        case "owner-abort": reference.dispose(); owner.abort(); break;
        case "switch-and-late-settle": {
          const previous = reference.choose(true);
          reference.select(); rt.batch(() => branch.set(!branch()));
          await settle(previous, false);
          break;
        }
      }
      check(step + 1);
    }
  } finally {
    stopView(); stopCommits(); source.dispose(); rt.flush();
    for (const task of tasks.values()) task.resolve(undefined);
    await Promise.resolve();
  }
}
