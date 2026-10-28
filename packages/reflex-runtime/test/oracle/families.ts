/**
 * Program families of the baseline oracle: one registry, used by the vitest
 * suites and by the testkit CLI (`testkit/`). A family maps a seed to a
 * program; seeds are independent between families, and the `default` and
 * `hub` distributions are the pinned generators of program.ts.
 *
 * Imports carry the `.ts` extension so Node runs this file with type
 * stripping, without a build step.
 */
import {
  generateHubProgram,
  generateProgram,
  prng,
  type CallbackSpec,
  type GraphSpec,
  type Op,
  type Program,
  type WatcherSpec,
} from "./program.ts";

export interface ProgramFamily {
  readonly id: string;
  readonly summary: string;
  generate(seed: number): Program;
}

/**
 * Wide consumers over `width` producers. Each reads a toggle-dependent extra
 * producer in front, in the middle or at the end, so a toggle write makes the
 * next pass meet a new dependency before (or after) a long unvisited suffix.
 * Watchers read the wide consumers and some of the same producers directly,
 * so subscriber order on shared producers is observable. Written for the
 * reconciliation policy change of 2026-10-25 (perf/structural-retention):
 * the default generator reaches a long unvisited suffix too rarely.
 */
export function generateTargetedProgram(seed: number): Program {
  const random = prng(seed);
  const int = (n: number) => Math.floor(random() * n);
  const width = 34 + int(14);
  const producers = width + 4; // data, then a toggle and three extras
  const toggle = width;
  const extras = [width + 1, width + 2, width + 3];
  const consumers: CallbackSpec[] = [];
  const wide = 1 + int(3);
  for (let c = 0; c < wide; c++) {
    const reads: CallbackSpec["reads"] = [];
    for (let k = 0; k < width; k++) reads.push({ node: k, mode: "lazy" });
    const where = int(3);
    const extra = {
      node: extras[int(3)]!,
      mode: "lazy" as const,
      when: { producer: toggle, parity: int(2) as 0 | 1 },
    };
    if (where === 0) reads.unshift(extra);
    else if (where === 1) reads.splice(int(width), 0, extra);
    else reads.push(extra);
    consumers.push({
      reads,
      ...(random() < 0.3
        ? {
            reverseWhen: {
              producer: extras[int(3)]!,
              parity: int(2) as 0 | 1,
            },
          }
        : {}),
    });
  }
  const watchers: WatcherSpec[] = [];
  const nWatchers = 2 + int(3);
  for (let w = 0; w < nWatchers; w++) {
    const reads: CallbackSpec["reads"] = [
      { node: producers + int(wide), mode: "lazy" },
    ];
    for (let k = 0; k < 2; k++)
      reads.push({ node: int(producers), mode: "lazy" });
    watchers.push({ reads });
  }
  const ops: Op[] = [];
  const total = 20 + int(20);
  for (let i = 0; i < total; i++) {
    const r = random();
    if (r < 0.3) ops.push({ kind: "write", producer: toggle, value: int(4) });
    else if (r < 0.55)
      ops.push({ kind: "write", producer: int(producers), value: int(5) });
    else if (r < 0.75) ops.push({ kind: "flush" });
    else if (r < 0.85)
      ops.push({ kind: "read", node: producers + int(wide), mode: "lazy" });
    else if (r < 0.92) ops.push({ kind: "run", watcher: int(nWatchers) });
    else ops.push({ kind: "snapshot" });
  }
  ops.push({ kind: "flush" }, { kind: "snapshot" });
  return { spec: { host: "claim", producers, consumers, watchers }, ops };
}

/**
 * Swarm features: each can be switched off as a whole in one program
 * (Groce et al., "Swarm Testing", ISSTA 2012). A uniform generator spends its
 * budget on programs that mix every feature, so a feature that suppresses a
 * failure (a batch that coalesces the write, a throw that ends the pass) is
 * almost always present; omitting random subsets reaches those failures.
 */
export const SWARM_FEATURES = [
  "batch",
  "context",
  "epoch",
  "dispose",
  "run",
  "hook",
  "nested-actions",
  "throws",
  "cleanup",
  "reverse",
  "conditional-reads",
] as const;
export type SwarmFeature = (typeof SWARM_FEATURES)[number];

/** The features a swarm seed switches off: each with probability 1/2. */
export function swarmConfiguration(seed: number): SwarmFeature[] {
  // Independent of the program's own stream: a separate, offset generator.
  const random = prng(seed ^ 0x5a5a_5a5a);
  return SWARM_FEATURES.filter(() => random() < 0.5);
}

function withoutOps(ops: Op[], off: ReadonlySet<SwarmFeature>): Op[] {
  const result: Op[] = [];
  for (const op of ops) {
    if (op.kind === "batch" || op.kind === "context") {
      const inner = withoutOps(op.ops, off);
      if (off.has(op.kind)) result.push(...inner);
      else result.push({ ...op, ops: inner });
    } else if (op.kind === "epoch" && off.has("epoch")) continue;
    else if (op.kind === "dispose" && off.has("dispose")) continue;
    else if (op.kind === "run" && off.has("run")) continue;
    else result.push(op);
  }
  return result;
}

function withoutCallbackFeatures(
  callback: WatcherSpec,
  off: ReadonlySet<SwarmFeature>,
): WatcherSpec {
  const next: WatcherSpec = { ...callback, reads: [...callback.reads] };
  if (off.has("nested-actions")) {
    delete next.action;
    delete next.actionWhen;
  }
  if (off.has("throws")) delete next.throwWhen;
  if (off.has("reverse")) delete next.reverseWhen;
  if (off.has("conditional-reads"))
    next.reads = next.reads.map(({ when: _when, ...read }) => read);
  if (next.cleanup !== undefined) {
    if (off.has("cleanup")) delete next.cleanup;
    else {
      const cleanup = { ...next.cleanup };
      if (off.has("nested-actions")) delete cleanup.action;
      if (off.has("throws")) delete cleanup.throwWhen;
      next.cleanup = cleanup;
    }
  }
  return next;
}

/**
 * A default-family program with the swarm configuration of its seed removed.
 * Removal only deletes optional parts, as the shrinker does, so every swarm
 * program is a valid program of the oracle language.
 */
export function generateSwarmProgram(seed: number): Program {
  const off = new Set(swarmConfiguration(seed));
  const base = generateProgram(seed);
  const spec: GraphSpec = {
    ...base.spec,
    consumers: base.spec.consumers.map(
      (callback) => withoutCallbackFeatures(callback, off) as CallbackSpec,
    ),
    watchers: base.spec.watchers.map((callback) =>
      withoutCallbackFeatures(callback, off),
    ),
  };
  if (off.has("hook")) delete spec.hook;
  return { spec, ops: withoutOps(base.ops, off) };
}

export const families: Readonly<Record<string, ProgramFamily>> = {
  default: {
    id: "default",
    summary: "pinned default distribution (program.ts generateProgram)",
    generate: (seed) => generateProgram(seed),
  },
  hub: {
    id: "hub",
    summary: "producer and computed hubs re-read by wide consumers (INV-H)",
    generate: (seed) => generateHubProgram(seed),
  },
  targeted: {
    id: "targeted",
    summary: "wide consumers with a conditional dependency before a suffix",
    generate: generateTargetedProgram,
  },
  swarm: {
    id: "swarm",
    summary: "default programs with a random feature subset switched off",
    generate: generateSwarmProgram,
  },
};

export function family(id: string): ProgramFamily {
  const found = families[id];
  if (found === undefined)
    throw new Error(
      `unknown program family "${id}" (known: ${Object.keys(families).join(", ")})`,
    );
  return found;
}
