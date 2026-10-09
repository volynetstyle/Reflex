import type { AsyncCommit, AsyncSource } from "../../src/index";
import { AsyncBlocker, AsyncDisposedError } from "../../src/index";
import type { Schedule, SpecApi } from "./async-spec-machine";

type Op =
  | "read-cached"
  | "read-target"
  | "refresh-target"
  | "settle-root"
  | "fail-root"
  | "dispose-root";
type RootStatus = "pending" | "ready" | "failed" | "disposed";

const FAILURE = new Error("pending root failed");
const MAX_DEPTH = 3;
const MAX_STATES = 200;

/** An independent state machine for capture while a cached input is blocked. */
class PendingCaptureSpecMachine {
  rootStatus: RootStatus = "pending";
  activeToken: number | undefined = 1;
  committedToken: number | undefined;
  targetReads = 0;
  cachedReads = 0;
  refreshes = 0;

  clone(): PendingCaptureSpecMachine {
    return Object.assign(new PendingCaptureSpecMachine(), this);
  }

  key(): string {
    return JSON.stringify([
      this.rootStatus,
      this.activeToken,
      this.committedToken,
      this.targetReads,
      this.cachedReads,
      this.refreshes,
    ]);
  }

  actions(): Op[] {
    const actions: Op[] = [];
    if (this.rootStatus === "pending" || this.rootStatus === "ready") {
      if (this.targetReads < 2) actions.push("read-target");
      if (this.cachedReads < 2) actions.push("read-cached");
    }
    if (this.rootStatus === "pending") {
      if (this.refreshes === 0) actions.push("refresh-target");
      actions.push("settle-root", "fail-root", "dispose-root");
    }
    return actions;
  }

  apply(op: Op): void {
    switch (op) {
      case "read-target":
        ++this.targetReads;
        break;
      case "read-cached":
        ++this.cachedReads;
        break;
      case "refresh-target":
        ++this.refreshes;
        this.activeToken = this.activeToken! + 1;
        break;
      case "settle-root":
        this.rootStatus = "ready";
        this.committedToken = this.activeToken! + 1;
        this.activeToken = undefined;
        break;
      case "fail-root":
        this.rootStatus = "failed";
        this.activeToken = undefined;
        break;
      case "dispose-root":
        this.rootStatus = "disposed";
        this.activeToken = undefined;
        break;
    }
  }

  assertRuntime(
    root: AsyncSource<number>,
    target: AsyncSource<number>,
    schedule: Schedule,
    history: readonly Op[],
  ): void {
    const label = `${schedule}: pending capture: ${history.join(" -> ")}`;
    const rootCommit = root.commit();
    same(
      rootCommit?.value,
      this.rootStatus === "ready" ? 1 : undefined,
      `${label}: root commit`,
    );
    same(
      root.error(),
      this.rootStatus === "failed" ? FAILURE : undefined,
      `${label}: root failure`,
    );

    const commit = target.commit();
    const expectedCommit: AsyncCommit<number> | undefined =
      this.rootStatus === "ready"
        ? { value: 2, version: 1, token: this.committedToken! }
        : undefined;
    same(commit?.value, expectedCommit?.value, `${label}: target value`);
    same(commit?.version, expectedCommit?.version, `${label}: target version`);
    same(commit?.token, expectedCommit?.token, `${label}: target token`);
    same(target.attempt()?.token, this.activeToken, `${label}: target attempt`);
    const error = target.error();
    if (this.rootStatus === "disposed") {
      if (!(error instanceof AsyncDisposedError))
        throw new Error(`${label}: expected disposed dependency failure`);
    } else {
      same(
        error,
        this.rootStatus === "failed" ? FAILURE : undefined,
        `${label}: target failure`,
      );
    }
  }
}

function enumerate(): {
  histories: readonly (readonly Op[])[];
  transitions: number;
  complete: boolean;
} {
  const initial = new PendingCaptureSpecMachine();
  const queue: Array<{ machine: PendingCaptureSpecMachine; history: Op[] }> = [
    { machine: initial, history: [] },
  ];
  const seen = new Set([initial.key()]);
  let transitions = 0;
  let complete = true;
  for (let index = 0; index < queue.length && complete; ++index) {
    const current = queue[index]!;
    if (current.history.length >= MAX_DEPTH) continue;
    for (const op of current.machine.actions()) {
      ++transitions;
      const machine = current.machine.clone();
      machine.apply(op);
      const key = machine.key();
      if (seen.has(key)) continue;
      if (queue.length >= MAX_STATES) {
        complete = false;
        break;
      }
      seen.add(key);
      queue.push({ machine, history: [...current.history, op] });
    }
  }
  return {
    histories: queue.map((item) => item.history),
    transitions,
    complete,
  };
}

export async function runPendingCaptureDifferential(
  api: SpecApi,
  schedule: Schedule,
) {
  const explored = enumerate();
  for (const history of explored.histories)
    await replayHistory(api, schedule, history);
  return {
    depth: MAX_DEPTH,
    maxStates: MAX_STATES,
    oracleStates: explored.histories.length,
    transitions: explored.transitions,
    replays: explored.histories.length,
    complete: explored.complete,
    captureMode: "pending" as const,
    schedules: [schedule],
  };
}

async function replayHistory(
  api: SpecApi,
  schedule: Schedule,
  history: readonly Op[],
): Promise<void> {
  const spec = new PendingCaptureSpecMachine();
  const runtime = api.createRuntime({ effectStrategy: schedule });
  const gate = deferred<number>();
  const root = api.asyncDerived<number>(() => gate.promise);
  const cached = api.derive(() => root.read() + 1);
  const target = api.asyncDerived<number>(() => Promise.resolve(cached()));
  const drain = async (): Promise<void> => {
    for (let cycle = 0; cycle < 5; ++cycle) {
      for (let tick = 0; tick < 8; ++tick) await Promise.resolve();
      runtime.flush();
    }
  };
  try {
    await drain();
    spec.assertRuntime(root, target, schedule, history);
    for (const op of history) {
      spec.apply(op);
      if (op === "read-cached" || op === "read-target") {
        const read = op === "read-cached" ? cached : target.read;
        try {
          const value = read();
          same(
            value,
            2,
            `${schedule}: pending capture: ${history.join(" -> ")}: read value`,
          );
          if (spec.rootStatus !== "ready")
            throw new Error(`${schedule}: pending capture: premature value`);
        } catch (error) {
          if (spec.rootStatus !== "pending" || !(error instanceof AsyncBlocker))
            throw error;
        }
      } else if (op === "refresh-target") {
        target.refresh();
      } else if (op === "settle-root") {
        gate.resolve(1);
      } else if (op === "fail-root") {
        gate.reject(FAILURE);
      } else if (op === "dispose-root") {
        root.dispose();
      }
      await drain();
      spec.assertRuntime(root, target, schedule, history);
    }
  } finally {
    target.dispose();
    root.dispose();
    gate.resolve(1);
    await drain();
  }
}

function same(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected))
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
