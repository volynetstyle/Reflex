import type { AsyncCommit, AsyncSource } from "../../src/index";
import { AsyncDisposedError } from "../../src/index";

export type Schedule = "flush" | "sab" | "eager";
export type RootId = 0 | 1;
export type CaptureMode = "direct" | "cached";

export type HistoryOp =
  | "branch-next"
  | "refresh-a"
  | "refresh-b"
  | "settle-a"
  | "settle-b"
  | "fail-a"
  | "fail-b"
  | "validate-oldest"
  | "validate-newest"
  | "validate-invalidates-b"
  | "validate-fails-b"
  | "validate-disposes-b"
  | "validate-supersedes"
  | "supersede"
  | "dispose-a"
  | "dispose-b"
  | "dispose-target";

type RootStatus = "ready" | "pending" | "failure" | "disposed";
type FlightStatus =
  | "pending"
  | "waiting"
  | "committed"
  | "failed"
  | "superseded"
  | "disposed";
type Hook = "invalidate-b" | "fail-b" | "dispose-b" | "supersede" | undefined;

interface SpecRoot {
  status: RootStatus;
  value: number;
  version: number;
  commitToken: number;
  token: number;
  pendingValue: number | undefined;
  failure: Error | undefined;
}

export interface SpecFlight {
  readonly token: number;
  readonly branch: number;
  readonly frontier: readonly RootId[];
  readonly value: number;
  resultSettled: boolean;
  status: FlightStatus;
  signal: AbortSignal | undefined;
}

export interface SpecSnapshot {
  readonly roots: readonly {
    status: RootStatus;
    value: number;
    version: number;
    commitToken: number;
    token: number;
    pendingValue: number | undefined;
    failure: Error | undefined;
  }[];
  readonly flights: readonly SpecFlight[];
  readonly branch: number;
  readonly currentToken: number | undefined;
  readonly commit: AsyncCommit<number> | undefined;
  readonly targetFailure: Error | "disposed" | undefined;
  readonly targetDisposed: boolean;
}

/**
 * Small, plain-record oracle for cached async frontiers.
 * It owns proof snapshots independently of the runtime's dependency Set.
 */
export class AsyncSpecMachine {
  private roots: [SpecRoot, SpecRoot] = [newRoot(), newRoot()];
  private flights: SpecFlight[] = [];
  private branch = 0;
  private currentToken: number | undefined;
  private nextTargetToken = 1;
  private commit: AsyncCommit<number> | undefined;
  private targetFailure: Error | "disposed" | undefined;
  private targetDisposed = false;
  private lastSelectedToken: number | undefined;

  constructor() {
    this.startTarget();
  }

  clone(): AsyncSpecMachine {
    const copy = Object.create(AsyncSpecMachine.prototype) as AsyncSpecMachine;
    copy.roots = this.roots.map((root) => ({ ...root })) as [
      SpecRoot,
      SpecRoot,
    ];
    copy.flights = this.flights.map((flight) => ({
      ...flight,
      frontier: [...flight.frontier],
    }));
    copy.branch = this.branch;
    copy.currentToken = this.currentToken;
    copy.nextTargetToken = this.nextTargetToken;
    copy.commit = this.commit === undefined ? undefined : { ...this.commit };
    copy.targetFailure = this.targetFailure;
    copy.targetDisposed = this.targetDisposed;
    copy.lastSelectedToken = this.lastSelectedToken;
    return copy;
  }

  snapshot(): SpecSnapshot {
    return {
      roots: this.roots.map((root) => ({
        status: root.status,
        value: root.value,
        version: root.version,
        commitToken: root.commitToken,
        token: root.token,
        pendingValue: root.pendingValue,
        failure: root.failure,
      })),
      flights: this.flights.map((flight) => ({
        ...flight,
        frontier: [...flight.frontier],
      })),
      branch: this.branch,
      currentToken: this.currentToken,
      commit: this.commit === undefined ? undefined : { ...this.commit },
      targetFailure: this.targetFailure,
      targetDisposed: this.targetDisposed,
    };
  }

  key(): string {
    const snapshot = this.snapshot();
    return JSON.stringify({
      roots: snapshot.roots.map((root) => [
        root.status,
        root.value,
        root.version,
        root.commitToken,
        root.token,
        root.pendingValue,
        root.failure === undefined ? undefined : "failure",
      ]),
      flights: snapshot.flights.map((flight) => [
        flight.token,
        flight.branch,
        flight.frontier,
        flight.value,
        flight.resultSettled,
        flight.status,
      ]),
      branch: snapshot.branch,
      currentToken: snapshot.currentToken,
      commit: snapshot.commit,
      targetFailure:
        snapshot.targetFailure instanceof Error
          ? "failure"
          : snapshot.targetFailure,
      targetDisposed: snapshot.targetDisposed,
      nextTargetToken: this.nextTargetToken,
    });
  }

  get selectedRoots(): readonly RootId[] {
    return this.frontierFor(this.branch);
  }

  get selectedValue(): number {
    return this.valueFor(this.branch);
  }

  get selectedBranch(): number {
    return this.branch;
  }

  get targetToken(): number | undefined {
    return this.currentToken;
  }

  get currentFlight(): SpecFlight | undefined {
    return this.currentToken === undefined
      ? undefined
      : this.flights.find((flight) => flight.token === this.currentToken);
  }

  get expectedCommit(): AsyncCommit<number> | undefined {
    return this.commit;
  }

  get expectedTargetFailure(): Error | "disposed" | undefined {
    return this.targetFailure;
  }

  get isTargetDisposed(): boolean {
    return this.targetDisposed;
  }

  get rootStates(): readonly SpecRoot[] {
    return this.roots;
  }

  get flightsSnapshot(): readonly SpecFlight[] {
    return this.flights;
  }

  get lastValidationToken(): number | undefined {
    return this.lastSelectedToken;
  }

  flight(token: number): SpecFlight | undefined {
    return this.flights.find((item) => item.token === token);
  }

  confirmCapture(token: number, signal: AbortSignal, value: number): void {
    const flight = this.flight(token);
    if (flight === undefined) throw new Error(`Unexpected B3 capture ${token}`);
    if (flight.branch !== this.branch)
      throw new Error(
        `Capture ${token} observed branch ${this.branch}, expected ${flight.branch}`,
      );
    if (flight.value !== value)
      throw new Error(
        `Capture ${token} observed ${value}, expected ${flight.value}`,
      );
    flight.signal = signal;
  }

  startTarget(): SpecFlight {
    if (this.targetDisposed) throw new Error("Cannot start a disposed target");
    const frontier = this.frontierFor(this.branch);
    if (!frontier.every((id) => this.roots[id].status === "ready"))
      throw new Error("Generated target capture must select ready roots");
    const previous = this.currentFlight;
    if (previous !== undefined && isLiveFlight(previous.status))
      previous.status = "superseded";
    const token = this.nextTargetToken++;
    const flight: SpecFlight = {
      token,
      branch: this.branch,
      frontier: [...frontier],
      value: this.valueFor(this.branch),
      resultSettled: false,
      status: "pending",
      signal: undefined,
    };
    this.flights.push(flight);
    this.currentToken = token;
    this.targetFailure = undefined;
    return flight;
  }

  refreshRoot(id: RootId): void {
    const root = this.roots[id];
    if (root.status === "disposed" || root.status === "pending")
      throw new Error(`Invalid refresh of root ${id} in ${root.status}`);
    root.status = "pending";
    root.failure = undefined;
    root.token += 1;
    root.pendingValue = root.value + 10;
  }

  invalidateRootDuringValidation(id: RootId): void {
    this.refreshRoot(id);
  }

  failRootDuringValidation(id: RootId): void {
    const root = this.roots[id];
    if (root.status !== "ready")
      throw new Error(`Cannot inject validation failure into root ${id}`);
    root.status = "failure";
    root.failure = VALIDATION_FAILURE;
    root.token += 1;
    root.pendingValue = undefined;
  }

  settleRoot(id: RootId, failure?: Error): void {
    const root = this.roots[id];
    if (root.status !== "pending")
      throw new Error(`Cannot settle root ${id} in ${root.status}`);
    const value = root.pendingValue;
    root.pendingValue = undefined;
    if (failure !== undefined) {
      root.status = "failure";
      root.failure = failure;
    } else {
      root.status = "ready";
      root.failure = undefined;
      root.value = value!;
      root.version += 1;
      root.commitToken = root.token;
    }
    this.resumeWaitingFlight();
  }

  disposeRoot(id: RootId): void {
    const root = this.roots[id];
    if (root.status === "disposed") return;
    root.status = "disposed";
    root.pendingValue = undefined;
    root.failure = undefined;
    this.resumeWaitingFlight();
  }

  switchBranch(): number {
    for (let offset = 1; offset <= 3; ++offset) {
      const next = (this.branch + offset) % 3;
      if (
        this.frontierFor(next).every((id) => this.roots[id].status === "ready")
      ) {
        this.branch = next;
        return next;
      }
    }
    throw new Error("No ready cached branch is available");
  }

  settleTarget(token: number, rejection?: Error, hook?: Hook): void {
    const flight = this.flight(token);
    if (flight === undefined) throw new Error(`Unknown target flight ${token}`);
    if (flight.resultSettled)
      throw new Error(`Target flight ${token} settled twice`);
    flight.resultSettled = true;
    this.lastSelectedToken = token;

    if (token !== this.currentToken || this.targetDisposed) {
      flight.status = this.targetDisposed ? "disposed" : "superseded";
      return;
    }

    if (!this.applyHook(flight, hook)) return;
    if (rejection !== undefined) {
      this.targetFailure = rejection;
      flight.status = "failed";
      this.currentToken = undefined;
      return;
    }
    this.tryPublish(flight);
  }

  disposeTarget(): void {
    if (this.targetDisposed) return;
    this.targetDisposed = true;
    const current = this.currentFlight;
    if (current !== undefined && isLiveFlight(current.status))
      current.status = "disposed";
    this.currentToken = undefined;
    this.targetFailure = undefined;
  }

  actions(): HistoryOp[] {
    const actions: HistoryOp[] = [];
    if (
      [0, 1, 2].some(
        (candidate) =>
          candidate !== this.branch &&
          this.frontierFor(candidate).every(
            (id) => this.roots[id].status === "ready",
          ),
      )
    )
      actions.push("branch-next");
    if (!this.targetDisposed) {
      if (this.selectedRoots.every((id) => this.roots[id].status === "ready"))
        actions.push("supersede");
      actions.push("dispose-target");
    }
    const pendingResults = this.flights.filter(
      (flight) => !flight.resultSettled,
    );
    if (pendingResults.length !== 0) {
      actions.push("validate-oldest", "validate-newest");
      const current = this.currentFlight;
      if (
        !this.targetDisposed &&
        current !== undefined &&
        !current.resultSettled
      ) {
        if (current.frontier.includes(1) && this.roots[1].status === "ready")
          actions.push("validate-invalidates-b");
        if (
          current.frontier.includes(0) &&
          current.frontier.includes(1) &&
          this.roots[1].status === "ready"
        )
          actions.push("validate-fails-b", "validate-disposes-b");
        if (this.selectedRoots.every((id) => this.roots[id].status === "ready"))
          actions.push("validate-supersedes");
      }
    }
    for (const id of [0, 1] as const) {
      const root = this.roots[id];
      if (root.status === "ready" || root.status === "failure")
        actions.push(id === 0 ? "refresh-a" : "refresh-b");
      if (root.status === "pending")
        actions.push(
          id === 0 ? "settle-a" : "settle-b",
          id === 0 ? "fail-a" : "fail-b",
        );
      if (root.status !== "disposed")
        actions.push(id === 0 ? "dispose-a" : "dispose-b");
    }
    return actions;
  }

  apply(op: HistoryOp): void {
    switch (op) {
      case "branch-next":
        this.switchBranch();
        break;
      case "refresh-a":
        this.refreshRoot(0);
        break;
      case "refresh-b":
        this.refreshRoot(1);
        break;
      case "settle-a":
        this.settleRoot(0);
        break;
      case "settle-b":
        this.settleRoot(1);
        break;
      case "fail-a":
        this.settleRoot(0, new Error("spec root A failed"));
        break;
      case "fail-b":
        this.settleRoot(1, new Error("spec root B failed"));
        break;
      case "validate-oldest":
        this.validateByOrder(false);
        break;
      case "validate-newest":
        this.validateByOrder(true);
        break;
      case "validate-invalidates-b":
        this.validateCurrent("invalidate-b");
        break;
      case "validate-fails-b":
        this.validateCurrent("fail-b");
        break;
      case "validate-disposes-b":
        this.validateCurrent("dispose-b");
        break;
      case "validate-supersedes":
        this.validateCurrent("supersede");
        break;
      case "supersede":
        this.startTarget();
        break;
      case "dispose-a":
        this.disposeRoot(0);
        break;
      case "dispose-b":
        this.disposeRoot(1);
        break;
      case "dispose-target":
        this.disposeTarget();
        break;
    }
  }

  assertRuntime(
    roots: readonly [AsyncSource<number>, AsyncSource<number>],
    target: AsyncSource<number>,
    trace: readonly HistoryOp[],
    schedule: Schedule,
  ): void {
    const label = `${schedule}: ${trace.join(" -> ")}`;
    for (const id of [0, 1] as const) {
      const expected = this.roots[id];
      const actualCommit = roots[id].commit();
      assertCommit(
        actualCommit,
        expectedCommit(expected),
        `${label}: root ${id} commit`,
      );
      same(
        roots[id].error(),
        expected.status === "failure" ? expected.failure : undefined,
        `${label}: root ${id} failure`,
      );
    }

    assertCommit(target.commit(), this.commit, `${label}: target commit`);
    const actualFailure = target.error();
    if (this.targetFailure === "disposed") {
      if (!(actualFailure instanceof AsyncDisposedError))
        throw new Error(`${label}: expected disposed dependency failure`);
    } else {
      same(actualFailure, this.targetFailure, `${label}: target failure`);
    }
    const actualAttempt = target.attempt();
    const expectedFlight = this.currentFlight;
    const expectedActive =
      !this.targetDisposed &&
      expectedFlight !== undefined &&
      isLiveFlight(expectedFlight.status)
        ? expectedFlight.token
        : undefined;
    same(actualAttempt?.token, expectedActive, `${label}: target attempt`);
    for (const flight of this.flights) {
      if (flight.status === "superseded" || flight.status === "disposed") {
        if (flight.signal !== undefined && !flight.signal.aborted)
          throw new Error(
            `${label}: obsolete attempt ${flight.token} stayed live`,
          );
      }
    }
  }

  private validateByOrder(newest: boolean): void {
    const available = this.flights.filter((flight) => !flight.resultSettled);
    const flight = newest ? available.at(-1) : available[0];
    if (flight === undefined)
      throw new Error("No unsettled target result to validate");
    this.settleTarget(flight.token);
  }

  private validateCurrent(hook: Exclude<Hook, undefined>): void {
    const flight = this.currentFlight;
    if (flight === undefined || flight.resultSettled)
      throw new Error("No unsettled current target result to validate");
    this.settleTarget(flight.token, undefined, hook);
  }

  private resumeWaitingFlight(): void {
    const flight = this.currentFlight;
    if (flight?.status === "waiting") this.tryPublish(flight);
  }

  private applyHook(flight: SpecFlight, hook?: Hook): boolean {
    if (hook === "supersede") {
      this.startTarget();
      flight.status = "superseded";
      return false;
    }
    if (hook === "invalidate-b") {
      this.invalidateRootDuringValidation(1);
    } else if (hook === "fail-b") {
      this.failRootDuringValidation(1);
    } else if (hook === "dispose-b") {
      this.disposeRoot(1);
    }
    return flight.token === this.currentToken && !this.targetDisposed;
  }

  private tryPublish(flight: SpecFlight): void {
    if (flight.token !== this.currentToken || this.targetDisposed) {
      flight.status = this.targetDisposed ? "disposed" : "superseded";
      return;
    }
    for (const id of flight.frontier) {
      const root = this.roots[id];
      if (root.status === "disposed") {
        flight.status = "failed";
        this.targetFailure = "disposed";
        this.currentToken = undefined;
        return;
      }
      if (root.status === "failure") {
        flight.status = "failed";
        this.targetFailure = root.failure;
        this.currentToken = undefined;
        return;
      }
      if (root.status === "pending") {
        flight.status = "waiting";
        return;
      }
    }
    const version = (this.commit?.version ?? 0) + 1;
    this.commit = { value: flight.value, version, token: flight.token };
    flight.status = "committed";
    this.currentToken = undefined;
    this.targetFailure = undefined;
  }

  private frontierFor(branch: number): RootId[] {
    switch (branch) {
      case 0:
        return [0];
      case 1:
        return [1];
      default:
        return [0, 1];
    }
  }

  private valueFor(branch: number): number {
    switch (branch) {
      case 0:
        return this.roots[0].value;
      case 1:
        return this.roots[1].value;
      default:
        return 9 * this.roots[0].value + 6 * this.roots[1].value;
    }
  }
}

export interface SpecApi {
  createRuntime(options: { effectStrategy: Schedule }): { flush(): void };
  asyncDerived<T>(
    job: (execution: {
      readonly attempt: {
        readonly token: number;
        readonly signal: AbortSignal;
      };
      read<T>(source: AsyncSource<T>): T;
    }) => T | PromiseLike<T>,
  ): AsyncSource<T>;
  derive<T>(expression: () => T): () => T;
  signal<T>(value: T): (() => T) & {
    set(input: T | ((previous: T) => T)): T;
  };
  untracked<T>(fn: () => T): T;
  beforeDependencyValidation(hook: (dependency: unknown) => void): void;
  beforePublicationValidation(hook: () => void): void;
  resetValidationHooks(): void;
  resetPublicationValidationCalls(): void;
  getPublicationValidationCalls(): number;
}

export interface BoundedReport {
  readonly depth: number;
  readonly maxStates: number;
  readonly oracleStates: number;
  readonly transitions: number;
  readonly replays: number;
  readonly complete: boolean;
  readonly captureMode: CaptureMode;
  readonly schedules: readonly Schedule[];
}

const MAX_DEPTH = 4;
const MAX_STATES = 1200;
const VALIDATION_FAILURE = new Error("root B failed during validation");

export function enumerateHistories(
  maxDepth = MAX_DEPTH,
  maxStates = MAX_STATES,
): {
  histories: readonly (readonly HistoryOp[])[];
  transitions: number;
  complete: boolean;
} {
  const initial = new AsyncSpecMachine();
  const queue: Array<{ machine: AsyncSpecMachine; history: HistoryOp[] }> = [
    { machine: initial, history: [] },
  ];
  const seen = new Map([[initial.key(), 0]]);
  let transitions = 0;
  let complete = true;
  for (let index = 0; index < queue.length && complete; ++index) {
    const current = queue[index]!;
    if (current.history.length >= maxDepth) continue;
    for (const op of current.machine.actions()) {
      ++transitions;
      const next = current.machine.clone();
      next.apply(op);
      const depth = current.history.length + 1;
      const key = next.key();
      const previousDepth = seen.get(key);
      if (previousDepth !== undefined && previousDepth <= depth) continue;
      if (queue.length >= maxStates) {
        complete = false;
        break;
      }
      seen.set(key, depth);
      queue.push({ machine: next, history: [...current.history, op] });
    }
  }
  return {
    histories: queue.map(({ history }) => history),
    transitions,
    complete,
  };
}

export async function runBoundedDifferential(
  api: SpecApi,
  schedule: Schedule,
  captureMode: CaptureMode = "direct",
): Promise<BoundedReport> {
  const explored = enumerateHistories();
  for (const history of explored.histories)
    await replayHistory(api, schedule, history, captureMode);
  return {
    depth: MAX_DEPTH,
    maxStates: MAX_STATES,
    oracleStates: explored.histories.length,
    transitions: explored.transitions,
    replays: explored.histories.length,
    complete: explored.complete,
    captureMode,
    schedules: [schedule],
  };
}

async function replayHistory(
  api: SpecApi,
  schedule: Schedule,
  history: readonly HistoryOp[],
  captureMode: CaptureMode,
): Promise<void> {
  const spec = new AsyncSpecMachine();
  const runtime = api.createRuntime({ effectStrategy: schedule });
  const rootPlans: [Array<Deferred<number>>, Array<Deferred<number>>] = [
    [],
    [],
  ];
  const rootFlights: [Array<Deferred<number>>, Array<Deferred<number>>] = [
    [],
    [],
  ];
  const rootThrows: [Error | undefined, Error | undefined] = [
    undefined,
    undefined,
  ];
  const targetGates = new Map<number, Deferred<number>>();
  const rootValues = [1, 1];
  const branch = api.signal(0);
  const roots = [0, 1].map((index) =>
    api.asyncDerived<number>(() => {
      const failure = rootThrows[index as RootId];
      if (failure !== undefined) {
        rootThrows[index as RootId] = undefined;
        throw failure;
      }
      const plan = rootPlans[index as RootId].shift();
      if (plan === undefined) return rootValues[index]!;
      rootFlights[index as RootId].push(plan);
      return plan.promise.then((value) => {
        rootValues[index] = value;
        return value;
      });
    }),
  ) as [AsyncSource<number>, AsyncSource<number>];
  const left = api.derive(() => roots[0].read());
  const right = api.derive(() => roots[1].read());
  const lowerLeft = api.derive(() => left() + right());
  const lowerRight = api.derive(() => left() * 2 + right());
  const middle = api.derive(() => lowerLeft() + lowerRight());
  const upperLeft = api.derive(() => middle() + lowerLeft());
  const upperRight = api.derive(() => middle() + lowerRight());
  const both = api.derive(() => upperLeft() + upperRight());
  const branches = [left, right, both] as const;
  const selected = api.derive(() => branches[branch()]!());
  api.untracked(selected);

  const target = api.asyncDerived<number>((execution) => {
    const flight = spec.flight(execution.attempt.token);
    if (flight === undefined)
      throw new Error(`Unexpected runtime attempt ${execution.attempt.token}`);
    flight.signal = execution.attempt.signal;
    const observed = api.untracked(selected);
    api.untracked(selected);
    api.untracked(selected);
    if (captureMode === "direct")
      for (const id of spec.selectedRoots)
        api.untracked(() => execution.read(roots[id]));
    spec.confirmCapture(
      execution.attempt.token,
      execution.attempt.signal,
      observed,
    );
    const gate = deferred<number>();
    targetGates.set(execution.attempt.token, gate);
    return gate.promise;
  });

  const activateRootPlan = (id: RootId, gate: Deferred<number>): void => {
    rootPlans[id].push(gate);
    roots[id].refresh();
  };
  const drain = async (): Promise<void> => {
    for (let cycle = 0; cycle < 3; ++cycle) {
      for (let tick = 0; tick < 8; ++tick) await Promise.resolve();
      runtime.flush();
    }
  };
  const assertState = (): void => {
    spec.assertRuntime(roots, target, history, schedule);
  };

  try {
    await drain();
    assertState();
    for (const op of history) {
      const previousBranch = spec.selectedBranch;
      const previousTarget = spec.targetToken;
      let rootGate: Deferred<number> | undefined;
      let targetToken: number | undefined;
      let rootValue: number | undefined;
      let rootFailure: Error | undefined;
      let expectedValidationCalls: number | undefined;

      if (op === "settle-a" || op === "settle-b") {
        const id: RootId = op === "settle-a" ? 0 : 1;
        rootValue = spec.rootStates[id]!.pendingValue;
        if (rootValue === undefined)
          throw new Error(`Oracle root ${id} has no pending value`);
      } else if (
        op === "validate-oldest" ||
        op === "validate-newest" ||
        op === "validate-invalidates-b" ||
        op === "validate-fails-b" ||
        op === "validate-disposes-b" ||
        op === "validate-supersedes"
      ) {
        if (
          op === "validate-invalidates-b" ||
          op === "validate-fails-b" ||
          op === "validate-disposes-b" ||
          op === "validate-supersedes"
        ) {
          targetToken = spec.targetToken;
        } else {
          const ordered = [...spec.flightsSnapshot].filter(
            (flight) => !flight.resultSettled,
          );
          const selectedFlight =
            op === "validate-newest" ? ordered.at(-1) : ordered[0];
          targetToken = selectedFlight?.token;
          if (
            selectedFlight !== undefined &&
            selectedFlight.token === spec.targetToken &&
            selectedFlight.frontier.every(
              (id) => spec.rootStates[id]!.status === "ready",
            )
          )
            expectedValidationCalls = selectedFlight.frontier.length;
        }
      }

      if (op === "refresh-a" || op === "refresh-b") {
        const id: RootId = op === "refresh-a" ? 0 : 1;
        const gate = deferred<number>();
        spec.apply(op);
        activateRootPlan(id, gate);
      } else if (op === "settle-a" || op === "settle-b") {
        const id: RootId = op === "settle-a" ? 0 : 1;
        try {
          api.untracked(() => roots[id].read());
        } catch {
          // A pending read can start a lazy root attempt.
        }
        await drain();
        rootGate = rootFlights[id].shift();
        if (rootGate === undefined)
          throw new Error(
            `Runtime root ${id} did not start its pending attempt`,
          );
        spec.apply(op);
        rootGate?.resolve(rootValue!);
      } else if (op === "fail-a" || op === "fail-b") {
        const id: RootId = op === "fail-a" ? 0 : 1;
        try {
          api.untracked(() => roots[id].read());
        } catch {
          // A pending read can start a lazy root attempt.
        }
        await drain();
        rootGate = rootFlights[id].shift();
        if (rootGate === undefined)
          throw new Error(
            `Runtime root ${id} did not start its pending attempt`,
          );
        spec.apply(op);
        rootFailure = spec.rootStates[id]!.failure;
        if (rootFailure === undefined)
          throw new Error(`Oracle root ${id} has no failure`);
        rootGate?.reject(rootFailure!);
      } else if (op === "branch-next") {
        spec.apply(op);
        branch.set(spec.selectedBranch);
        api.untracked(selected);
      } else if (op === "supersede") {
        spec.apply(op);
        target.refresh();
      } else if (
        op === "validate-oldest" ||
        op === "validate-newest" ||
        op === "validate-invalidates-b" ||
        op === "validate-fails-b" ||
        op === "validate-disposes-b" ||
        op === "validate-supersedes"
      ) {
        spec.apply(op);
        if (expectedValidationCalls !== undefined)
          api.resetPublicationValidationCalls();
        if (targetToken !== undefined) {
          const gate = targetGates.get(targetToken);
          const flight = spec.flight(targetToken);
          if (op === "validate-invalidates-b") {
            const rootGate = deferred<number>();
            api.beforeDependencyValidation(() => activateRootPlan(1, rootGate));
          } else if (op === "validate-fails-b") {
            api.beforeDependencyValidation((dependency) => {
              if (dependency === roots[0]) {
                rootThrows[1] = VALIDATION_FAILURE;
                roots[1].refresh();
              }
            });
          } else if (op === "validate-disposes-b") {
            api.beforeDependencyValidation((dependency) => {
              if (dependency === roots[0]) roots[1].dispose();
            });
          } else if (op === "validate-supersedes") {
            api.beforePublicationValidation(() => target.refresh());
          }
          if (gate !== undefined && flight !== undefined)
            gate.resolve(flight.value);
        }
      } else if (op === "dispose-a" || op === "dispose-b") {
        const id: RootId = op === "dispose-a" ? 0 : 1;
        spec.apply(op);
        roots[id].dispose();
      } else if (op === "dispose-target") {
        spec.apply(op);
        target.dispose();
      }

      await drain();
      assertState();
      if (expectedValidationCalls !== undefined)
        same(
          api.getPublicationValidationCalls(),
          expectedValidationCalls,
          `${schedule}: ${history.join(" -> ")}: unique frontier validations`,
        );
      if (spec.selectedBranch !== previousBranch && op !== "branch-next")
        throw new Error("Oracle branch changed outside a branch event");
      if (previousTarget === spec.targetToken && op === "supersede")
        throw new Error("Oracle did not allocate a superseding attempt");
    }
  } finally {
    api.resetValidationHooks();
    target.dispose();
    roots[0].dispose();
    roots[1].dispose();
    for (const gate of targetGates.values()) gate.resolve(0);
    for (const queues of rootFlights)
      for (const gate of queues) gate.resolve(0);
    for (const queue of rootPlans) for (const gate of queue) gate.resolve(0);
    await drain();
  }
}

function expectedCommit(root: SpecRoot): AsyncCommit<number> | undefined {
  return root.version === 0
    ? undefined
    : {
        value: root.value,
        version: root.version,
        token: root.commitToken,
      };
}

function assertCommit(
  actual: AsyncCommit<number> | undefined,
  expected: AsyncCommit<number> | undefined,
  label: string,
): void {
  same(actual?.value, expected?.value, `${label}: value`);
  same(actual?.version, expected?.version, `${label}: version`);
  same(actual?.token, expected?.token, `${label}: token`);
}

function same(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected))
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
}

function newRoot(): SpecRoot {
  return {
    status: "ready",
    value: 1,
    version: 1,
    commitToken: 1,
    token: 1,
    pendingValue: undefined,
    failure: undefined,
  };
}

function isLiveFlight(status: FlightStatus): boolean {
  return status === "pending" || status === "waiting";
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
