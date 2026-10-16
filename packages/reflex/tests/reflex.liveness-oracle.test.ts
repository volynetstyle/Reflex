/**
 * Independent liveness oracle.
 *
 * It models no runtime flags. A generated program is a pure dataflow graph
 * (signals, a DAG of computeds with dynamic branches and equality cutoff,
 * effects) plus bounded side effects: effects that write back, cleanups that
 * write, callbacks that throw. A global write budget makes every program finite.
 *
 * After the program reaches quiescence, every live effect's last snapshot must
 * equal what the pure model derives from the signal values actually present
 * in the runtime. The final signal values may depend on effect order (two
 * effects racing to write one signal); the oracle never predicts them, it only
 * requires each effect to have observed the final state. That property is
 * order-independent, so the oracle needs no model of scheduler order.
 *
 * Outcomes are classified, never merged:
 * - `stale`: quiescent, but an effect missed a change (lost delivery);
 * - `non-termination`: no quiescence within the run and drain bounds.
 *
 * Tiers (vitest `--mode`): `liveness-smoke` 300 programs per strategy, default
 * 3000 (every PR, part of `test`), `liveness-extended` 30000 (nightly).
 * Reproduce one program with LIVENESS_SEED=<seed>. LIVENESS_FEATURES selects
 * side effects: `ew` effect writes, `cl` cleanup writes, `th` throws; `acw`
 * (computed writes outside its own inputs) and `cw` (any computed writes)
 * reach F1, which is open, and are therefore opt-in.
 */
import { describe, expect, it } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

type Ref = { kind: "s" | "c"; index: number };
type Kind = "sum" | "mod2" | "branch" | "cmp";
type SideWrite = { target: number; delta: number };
type ComputedSpec = { kind: Kind; inputs: Ref[]; write?: SideWrite };
type EffectSpec = {
  kind: Kind;
  inputs: Ref[];
  write?: SideWrite;
  cleanupWrite?: SideWrite;
  throwAfterWrite?: boolean;
};
type Op =
  | { op: "set"; signal: number; value: number }
  | { op: "batch"; writes: { signal: number; value: number }[] }
  | { op: "flush" };
type Program = {
  signals: number[];
  computeds: ComputedSpec[];
  effects: EffectSpec[];
  ops: Op[];
  writeBudget: number;
  throwBudget: number;
};
type Outcome = "ok" | "stale" | "non-termination";

const TIERS: Record<string, number> = {
  "liveness-smoke": 300,
  "liveness-extended": 30_000,
};
const SEEDS = Number(
  process.env.LIVENESS_SEEDS ?? TIERS[import.meta.env.MODE] ?? 3_000,
);
const ONLY = process.env.LIVENESS_SEED;
const FEATURES = new Set(
  (process.env.LIVENESS_FEATURES ?? "ew,cl,th").split(","),
);
const RUN_CAP = 5_000;
const DRAIN_CAP = 200;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(seed: number): Program {
  const r = prng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const kinds: Kind[] = ["sum", "mod2", "branch", "cmp"];
  const S = 2 + int(4);
  const C = 1 + int(5);
  const E = 1 + int(4);
  const ref = (maxC: number): Ref =>
    maxC > 0 && r() < 0.6
      ? { kind: "c", index: int(maxC) }
      : { kind: "s", index: int(S) };
  const inputs = (maxC: number, kind: Kind) =>
    Array.from({ length: kind === "branch" ? 3 : 1 + int(3) }, () => ref(maxC));
  const sideWrite = (p: number): SideWrite | undefined =>
    r() < p ? { target: int(S), delta: 1 + int(3) } : undefined;

  const computeds: ComputedSpec[] = [];
  const upstream: Set<number>[] = [];
  for (let i = 0; i < C; i++) {
    const kind = kinds[int(kinds.length)]!;
    const ins = inputs(i, kind);
    const up = new Set<number>();
    for (const input of ins)
      if (input.kind === "s") up.add(input.index);
      else for (const x of upstream[input.index]!) up.add(x);
    upstream.push(up);
    let write =
      FEATURES.has("cw") || FEATURES.has("acw") ? sideWrite(0.15) : undefined;
    if (write !== undefined && !FEATURES.has("cw") && up.has(write.target)) {
      const free = [...Array(S).keys()].filter((x) => !up.has(x));
      write = free.length === 0 ? undefined : { ...write, target: free[0]! };
    }
    computeds.push({ kind, inputs: ins, write });
  }
  const effects: EffectSpec[] = [];
  for (let i = 0; i < E; i++) {
    const kind = kinds[int(kinds.length)]!;
    effects.push({
      kind,
      inputs: inputs(C, kind),
      write: FEATURES.has("ew") ? sideWrite(0.4) : undefined,
      cleanupWrite: FEATURES.has("cl") ? sideWrite(0.15) : undefined,
      throwAfterWrite: FEATURES.has("th") && r() < 0.15,
    });
  }
  const ops: Op[] = [];
  const nOps = 2 + int(10);
  for (let i = 0; i < nOps; i++) {
    const x = r();
    if (x < 0.55) ops.push({ op: "set", signal: int(S), value: int(6) });
    else if (x < 0.75)
      ops.push({
        op: "batch",
        writes: Array.from({ length: 1 + int(3) }, () => ({
          signal: int(S),
          value: int(6),
        })),
      });
    else ops.push({ op: "flush" });
  }
  return {
    signals: Array.from({ length: S }, () => int(6)),
    computeds,
    effects,
    ops,
    writeBudget: int(12),
    throwBudget: int(3),
  };
}

/** Evaluates a node kind; `branch` reads only the selected arm. */
function evaluate(
  kind: Kind,
  inputs: Ref[],
  read: (ref: Ref) => number,
  trace?: number[],
): number {
  const take = (ref: Ref) => {
    const v = read(ref);
    trace?.push(v);
    return v;
  };
  switch (kind) {
    case "sum":
      return inputs.reduce((acc, ref) => acc + take(ref), 0);
    case "mod2":
      return inputs.reduce((acc, ref) => acc + take(ref), 0) % 2;
    case "cmp":
      return inputs.reduce((acc, ref) => acc + take(ref), 0) > 4 ? 1 : 0;
    case "branch":
      return take(inputs[0]!) % 2 === 0 ? take(inputs[1]!) : take(inputs[2]!);
  }
}

const strategies = ["flush", "sab", "eager"] as const;
type Strategy = (typeof strategies)[number];

type Result = { outcome: Outcome; detail: string; events: string[] };

function execute(program: Program, strategy: Strategy): Result {
  const rt =
    strategy === "flush"
      ? createRuntime()
      : createRuntime({ effectStrategy: strategy });
  const events: string[] = [];
  let writeBudget = program.writeBudget;
  let throwBudget = program.throwBudget;
  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      events.push(`error ${(error as Error).message}`);
    }
  };
  const sigs = program.signals.map((v) => signal(v));
  const sideWrite = (who: string, w: SideWrite | undefined, base: number) => {
    if (w === undefined || writeBudget <= 0) return;
    writeBudget--;
    const value = (base + w.delta) % 7;
    events.push(`${who} writes s${w.target}=${value}`);
    sigs[w.target]!.set(value);
  };
  const read = (ref: Ref): number =>
    ref.kind === "s" ? sigs[ref.index]!() : comps[ref.index]!();

  const comps: (() => number)[] = [];
  program.computeds.forEach((spec, i) => {
    comps.push(
      computed(() => {
        const v = evaluate(spec.kind, spec.inputs, read);
        sideWrite(`c${i}`, spec.write, v);
        return v;
      }),
    );
  });

  const snapshots: (number[] | null)[] = program.effects.map(() => null);
  const live = program.effects.map(() => false);
  let totalRuns = 0;
  program.effects.forEach((spec, i) => {
    guard(() => {
      effect(() => {
        if (++totalRuns > RUN_CAP) return;
        const trace: number[] = [];
        const v = evaluate(spec.kind, spec.inputs, read, trace);
        snapshots[i] = trace;
        events.push(`e${i} runs, sees [${trace}]`);
        sideWrite(`e${i}`, spec.write, v);
        if (spec.throwAfterWrite && throwBudget > 0) {
          throwBudget--;
          throw new Error(`e${i} throws`);
        }
        const w = spec.cleanupWrite;
        if (w === undefined) return;
        return () => sideWrite(`e${i} cleanup`, w, v);
      });
      live[i] = true;
    });
  });

  for (const op of program.ops) {
    if (op.op === "set") {
      events.push(`set s${op.signal}=${op.value}`);
      guard(() => sigs[op.signal]!.set(op.value));
    } else if (op.op === "batch") {
      events.push(
        `batch ${op.writes.map((w) => `s${w.signal}=${w.value}`).join(" ")}`,
      );
      guard(() =>
        rt.batch(() => {
          for (const w of op.writes) sigs[w.signal]!.set(w.value);
        }),
      );
    } else {
      events.push("flush");
      guard(() => rt.flush());
    }
  }

  // Quiescence: one drain that neither throws nor runs an effect.
  let quiescent = false;
  for (let i = 0; i < DRAIN_CAP && totalRuns <= RUN_CAP; i++) {
    const before = totalRuns;
    let threw = false;
    try {
      rt.flush();
    } catch (error) {
      events.push(`error ${(error as Error).message}`);
      threw = true;
    }
    if (!threw && totalRuns === before) {
      quiescent = true;
      break;
    }
  }
  if (!quiescent)
    return {
      outcome: "non-termination",
      detail: `${totalRuns} effect runs without quiescence`,
      events,
    };

  // Pure model over the signal values present in the runtime.
  const truthSignals = sigs.map((s) => s());
  const memo = new Map<number, number>();
  const truth = (ref: Ref): number => {
    if (ref.kind === "s") return truthSignals[ref.index]!;
    const cached = memo.get(ref.index);
    if (cached !== undefined) return cached;
    const spec = program.computeds[ref.index]!;
    const v = evaluate(spec.kind, spec.inputs, truth);
    memo.set(ref.index, v);
    return v;
  };
  const stale: string[] = [];
  program.effects.forEach((spec, i) => {
    if (!live[i]) return; // creation failed: not a live effect
    const expected: number[] = [];
    evaluate(spec.kind, spec.inputs, truth, expected);
    const got = snapshots[i];
    if (got === null || got.join() !== expected.join())
      stale.push(`e${i} saw [${got}], model [${expected}]`);
  });
  return stale.length === 0
    ? { outcome: "ok", detail: "", events }
    : { outcome: "stale", detail: stale.join("; "), events };
}

/** Candidate reductions of a program, smallest-first in spirit. */
function* reductions(p: Program): Generator<Program> {
  for (let i = 0; i < p.ops.length; i++)
    yield { ...p, ops: p.ops.filter((_, j) => j !== i) };
  for (let i = 0; i < p.effects.length; i++)
    yield { ...p, effects: p.effects.filter((_, j) => j !== i) };
  if (p.writeBudget > 0) yield { ...p, writeBudget: p.writeBudget - 1 };
  if (p.throwBudget > 0) yield { ...p, throwBudget: p.throwBudget - 1 };
  const clear = <T, K extends keyof T>(items: T[], i: number, key: K) =>
    items.map((item, j) => (j === i ? { ...item, [key]: undefined } : item));
  for (let i = 0; i < p.effects.length; i++) {
    const e = p.effects[i]!;
    if (e.write) yield { ...p, effects: clear(p.effects, i, "write") };
    if (e.cleanupWrite)
      yield { ...p, effects: clear(p.effects, i, "cleanupWrite") };
    if (e.throwAfterWrite)
      yield { ...p, effects: clear(p.effects, i, "throwAfterWrite") };
  }
  for (let i = 0; i < p.computeds.length; i++)
    if (p.computeds[i]!.write)
      yield { ...p, computeds: clear(p.computeds, i, "write") };
}

/**
 * Greedy shrinking that preserves the failure's outcome class. Bounded: a
 * non-terminating candidate costs a full run cap, so the report must not
 * become slower than the failure it explains.
 */
const SHRINK_BUDGET = 400;
function minimize(p: Program, strategy: Strategy, outcome: Outcome): Program {
  let current = p;
  let budget = SHRINK_BUDGET;
  for (let progress = true; progress && budget > 0; ) {
    progress = false;
    for (const candidate of reductions(current)) {
      if (--budget < 0) break;
      if (execute(candidate, strategy).outcome === outcome) {
        current = candidate;
        progress = true;
        break;
      }
    }
  }
  return current;
}

function report(seed: number, strategy: Strategy, result: Result): string {
  const program = generate(seed);
  const minimal = minimize(program, strategy, result.outcome);
  const replay = execute(minimal, strategy);
  return [
    `${result.outcome} [${strategy}], seed ${seed}: ${result.detail}`,
    `Reproduce: LIVENESS_SEED=${seed} LIVENESS_FEATURES=${[...FEATURES].join(",")}`,
    `Minimized: ${JSON.stringify(minimal)}`,
    `Minimized outcome: ${replay.detail}`,
    "Events:",
    ...replay.events.slice(-40).map((event) => `  ${event}`),
  ].join("\n");
}

describe.each(strategies)("liveness oracle [%s]", (strategy) => {
  it(`every live effect observes the quiescent state (${SEEDS} programs)`, () => {
    const failures = { stale: [] as number[], "non-termination": [] as number[] };
    let first: string | undefined;
    for (let seed = 1; seed <= SEEDS; seed++) {
      if (ONLY !== undefined && seed !== Number(ONLY)) continue;
      const result = execute(generate(seed), strategy);
      if (result.outcome === "ok") continue;
      failures[result.outcome].push(seed);
      first ??= report(seed, strategy, result);
    }
    if (first !== undefined)
      throw new Error(
        [
          `stale: ${failures.stale.length} programs, non-termination: ${failures["non-termination"].length} programs`,
          first,
        ].join("\n"),
      );
    expect(failures).toEqual({ stale: [], "non-termination": [] });
  }, 300_000);
});
