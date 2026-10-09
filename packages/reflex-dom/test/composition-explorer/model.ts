/** A deliberately small language for valid public-API compositions. */
export type Source =
  | "signal"
  | "computed"
  | "memo"
  | "model"
  | "context"
  | "ref";
export type Consumer =
  | "jsx"
  | "show"
  | "switch"
  | "for"
  | "portal"
  | "effect"
  | "mounted-effect";
export type Owner = "component" | "owned" | "model" | "model-independent";
export type Host = "dom" | "ssr";
export type Strategy = "eager" | "sab" | "flush";

export interface Program {
  source: Source;
  consumer: Consumer;
  owner: Owner;
  host: Host;
  /** An identity computation inserted between the source and its consumer. */
  identity: boolean;
  /** An unrelated producer, written alongside the observable source. */
  unrelated: boolean;
}

export type Operation =
  | { kind: "write"; value: number }
  | { kind: "list"; ids: readonly number[] }
  | { kind: "settle" }
  | { kind: "dispose" };

export type Classification =
  | "VALID"
  | "VALID_REDUNDANT"
  | "VALID_SPECIALIZED"
  | "CONTEXT_DEPENDENT"
  | "INVALID"
  | "UNSPECIFIED";

export type Finding = Classification | "DIVERGENT" | "CONDITIONAL_DIVERGENCE";

export interface Observation {
  semantics: { output: readonly string[] };
  obligations: {
    childMounts: number;
    childCleanups: number;
    lifecycle: readonly string[];
    ownerEvents: readonly string[];
    ownerTopologyViolations: number;
    keyedViolations: readonly string[];
    effects: readonly string[];
    errors: readonly string[];
  };
  cost: {
    reads: number;
    computations: number;
    invalidations: number;
    domOps: number;
  };
}

export interface Relation {
  check(baseline: Observation, variant: Observation): readonly string[];
}

export interface Case {
  program: Program;
  trace: readonly Operation[];
}

/** Reject combinations the executor cannot give a meaningful interpretation. */
export function validateCase(input: Case): void {
  if (input.program.host === "ssr" && input.trace.length > 0) {
    throw new Error("SSR programs only support an initial render");
  }
  if (
    input.program.host === "ssr" &&
    (input.program.consumer === "portal" ||
      input.program.consumer === "effect" ||
      input.program.consumer === "mounted-effect")
  ) {
    throw new Error("This consumer requires a DOM host");
  }
  if (input.program.host === "ssr" && input.program.owner !== "component") {
    throw new Error("Ownership topology requires a DOM host");
  }
  if (
    input.trace.some((step) => step.kind === "list") &&
    input.program.consumer !== "for"
  ) {
    throw new Error("List operations require For");
  }
}

export interface Transformation {
  name: string;
  applicable(input: Case): boolean;
  transform(input: Case): Case;
  relation: Relation;
}

export type RelationPredicate = (
  baseline: Observation,
  variant: Observation,
) => string | undefined;

export function preserveOutput(): RelationPredicate {
  return (a, b) =>
    JSON.stringify(a.semantics.output) === JSON.stringify(b.semantics.output)
      ? undefined
      : "output";
}

export function preserveTargetLifetime(): RelationPredicate {
  return (a, b) =>
    a.obligations.childMounts === b.obligations.childMounts &&
    a.obligations.childCleanups === b.obligations.childCleanups &&
    JSON.stringify(a.obligations.lifecycle) ===
      JSON.stringify(b.obligations.lifecycle) &&
    JSON.stringify(a.obligations.effects) ===
      JSON.stringify(b.obligations.effects)
      ? undefined
      : "target-lifetime";
}

export function sameErrors(): RelationPredicate {
  return (a, b) =>
    JSON.stringify(a.obligations.errors) ===
    JSON.stringify(b.obligations.errors)
      ? undefined
      : "errors";
}

export function addsCleanup(owner: string, count = 1): RelationPredicate {
  return (a, b) =>
    b.obligations.ownerEvents.filter((event) => event === `${owner}:cleanup`)
      .length -
      a.obligations.ownerEvents.filter((event) => event === `${owner}:cleanup`)
        .length ===
    count
      ? undefined
      : `owner-cleanup:${owner}`;
}

export function balancedOwnership(): RelationPredicate {
  const balanced = (observation: Observation) => {
    if (observation.obligations.ownerTopologyViolations !== 0) return false;
    if (observation.obligations.keyedViolations.length !== 0) return false;
    return ["nested", "model", "independent"].every(
      (owner) =>
        observation.obligations.ownerEvents.filter(
          (event) => event === `${owner}:mount`,
        ).length ===
        observation.obligations.ownerEvents.filter(
          (event) => event === `${owner}:cleanup`,
        ).length,
    );
  };
  return (a, b) => (balanced(a) && balanced(b) ? undefined : "ownership");
}

export function relation(...checks: readonly RelationPredicate[]): Relation {
  return {
    check(a, b) {
      return checks.flatMap((check) => {
        const issue = check(a, b);
        return issue === undefined ? [] : [issue];
      });
    },
  };
}

export const OUTPUT_RELATION = relation(
  preserveOutput(),
  preserveTargetLifetime(),
  sameErrors(),
  balancedOwnership(),
);

function writesAfterDispose(trace: readonly Operation[]): boolean {
  const index = trace.findIndex((step) => step.kind === "dispose");
  return (
    index >= 0 &&
    trace
      .slice(index + 1)
      .some((step) => step.kind === "write" || step.kind === "list")
  );
}

export const transformations: readonly Transformation[] = [
  {
    name: "identity-derived",
    applicable: ({ program, trace }) =>
      !program.identity &&
      program.host === "dom" &&
      !(program.owner === "model-independent" && writesAfterDispose(trace)),
    transform: ({ program, trace }) => ({
      program: { ...program, identity: true },
      trace,
    }),
    relation: OUTPUT_RELATION,
  },
  {
    name: "show-to-switch",
    applicable: ({ program }) => program.consumer === "show",
    transform: ({ program, trace }) => ({
      program: { ...program, consumer: "switch" },
      trace,
    }),
    relation: OUTPUT_RELATION,
  },
  {
    name: "nested-owner-insertion",
    applicable: ({ program }) =>
      program.owner === "component" && program.host === "dom",
    transform: ({ program, trace }) => ({
      program: { ...program, owner: "owned" },
      trace,
    }),
    relation: relation(
      preserveOutput(),
      preserveTargetLifetime(),
      sameErrors(),
      balancedOwnership(),
      addsCleanup("nested"),
    ),
  },
  {
    name: "same-value-write",
    applicable: ({ program, trace }) =>
      program.host === "dom" && trace.some((step) => step.kind === "write"),
    transform: ({ program, trace }) => ({
      program,
      trace: trace.flatMap((step): Operation[] =>
        step.kind === "write" ? [step, { ...step }] : [step],
      ),
    }),
    relation: OUTPUT_RELATION,
  },
  {
    name: "irrelevant-state",
    applicable: ({ program }) => !program.unrelated && program.host === "dom",
    transform: ({ program, trace }) => ({
      program: { ...program, unrelated: true },
      trace,
    }),
    relation: OUTPUT_RELATION,
  },
];

export function difference(
  a: Observation,
  b: Observation,
  relation: Relation,
): string[] {
  return [...relation.check(a, b)];
}

export function dominates(
  a: Observation["cost"],
  b: Observation["cost"],
): boolean {
  return (
    a.reads <= b.reads &&
    a.computations <= b.computations &&
    a.invalidations <= b.invalidations &&
    a.domOps <= b.domOps &&
    (a.reads < b.reads ||
      a.computations < b.computations ||
      a.invalidations < b.invalidations ||
      a.domOps < b.domOps)
  );
}

/** Only compare cost among observations whose declared relations already passed. */
export function paretoFrontier(
  costs: readonly Observation["cost"][],
): number[] {
  return costs.flatMap((candidate, index) =>
    costs.some(
      (other, otherIndex) =>
        otherIndex !== index && dominates(other, candidate),
    )
      ? []
      : [index],
  );
}

export interface Evidence {
  baseline: Observation;
  variant: Observation;
  issues: readonly string[];
}

/** Classification requires a declared contract and observations from workloads. */
export function classifyEvidence(
  contract: "equivalent" | "reject" | "unknown",
  samples: readonly Evidence[],
): Finding {
  if (contract === "unknown" || samples.length === 0) return "UNSPECIFIED";
  if (contract === "reject") {
    return samples.every(({ variant }) => variant.obligations.errors.length > 0)
      ? "INVALID"
      : "UNSPECIFIED";
  }
  const failures = samples.filter(({ issues }) => issues.length > 0).length;
  if (failures === samples.length) return "DIVERGENT";
  if (failures > 0) return "CONDITIONAL_DIVERGENCE";
  const baselineWins = samples.filter(({ baseline, variant }) =>
    dominates(baseline.cost, variant.cost),
  ).length;
  const variantWins = samples.some(({ baseline, variant }) =>
    dominates(variant.cost, baseline.cost),
  );
  const tradeoff = samples.some(
    ({ baseline, variant }) =>
      !dominates(baseline.cost, variant.cost) &&
      !dominates(variant.cost, baseline.cost) &&
      JSON.stringify(baseline.cost) !== JSON.stringify(variant.cost),
  );
  if (baselineWins === samples.length) return "VALID_REDUNDANT";
  if ((baselineWins > 0 && variantWins) || tradeoff) return "VALID_SPECIALIZED";
  return "VALID";
}

const SOURCES: readonly Source[] = [
  "signal",
  "computed",
  "memo",
  "model",
  "context",
  "ref",
];
const CONSUMERS: readonly Consumer[] = [
  "jsx",
  "show",
  "switch",
  "for",
  "portal",
  "effect",
  "mounted-effect",
];
const OWNERS: readonly Owner[] = [
  "component",
  "owned",
  "model",
  "model-independent",
];
const HOSTS: readonly Host[] = ["dom", "ssr"];

export function programFeatures(program: Program): string[] {
  return [
    `source=${program.source}`,
    `consumer=${program.consumer}`,
    `owner=${program.owner}`,
    `host=${program.host}`,
  ];
}

function pairs(values: readonly string[]): string[] {
  const result: string[] = [];
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      result.push(`${values[left]}|${values[right]}`);
    }
  }
  return result;
}

const STRENGTHEN: readonly [Source, Consumer, Owner][] = [
  ["computed", "show", "owned"],
  ["model", "switch", "owned"],
  ["memo", "jsx", "component"],
  ["context", "portal", "model"],
  ["context", "portal", "model-independent"],
  ["ref", "for", "component"],
];

function coverageKeys(program: Program): string[] {
  const keys = pairs(programFeatures(program));
  if (
    STRENGTHEN.some(
      ([source, consumer, owner]) =>
        source === program.source &&
        consumer === program.consumer &&
        owner === program.owner,
    )
  ) {
    keys.push(programFeatures(program).slice(0, 3).join("|"));
  }
  return keys;
}

/** Greedy pair coverage over valid programs, with stable ordering and no random gaps. */
export function coverPrograms(): Program[] {
  const candidates: Program[] = [];
  for (const source of SOURCES) {
    for (const consumer of CONSUMERS) {
      for (const owner of OWNERS) {
        for (const host of HOSTS) {
          if (
            host === "ssr" &&
            ["portal", "effect", "mounted-effect"].includes(consumer)
          )
            continue;
          if (host === "ssr" && owner !== "component") continue;
          candidates.push({
            source,
            consumer,
            owner,
            host,
            identity: false,
            unrelated: false,
          });
        }
      }
    }
  }
  const uncovered = new Set(candidates.flatMap(coverageKeys));
  const selected: Program[] = [];
  while (uncovered.size > 0) {
    let best: Program | undefined;
    let score = 0;
    for (const candidate of candidates) {
      const gain = coverageKeys(candidate).filter((key) =>
        uncovered.has(key),
      ).length;
      if (gain > score) {
        best = candidate;
        score = gain;
      }
    }
    if (best === undefined) throw new Error("Unreachable coverage target");
    selected.push(best);
    for (const key of coverageKeys(best)) uncovered.delete(key);
  }
  return selected;
}

/** Deterministic traces emphasize branch changes, repeated values and disposal. */
export function generateTrace(seed: number): Operation[] {
  let state = seed >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const trace: Operation[] = [];
  for (let index = 0; index < 6; index++) {
    trace.push({ kind: "write", value: (next() % 5) - 2 });
    if (index % 2 === 1) trace.push({ kind: "settle" });
  }
  trace.push(
    { kind: "dispose" },
    { kind: "write", value: 3 },
    { kind: "settle" },
  );
  return trace;
}

export interface TraceFamily {
  name: string;
  trace: readonly Operation[];
}

const write = (value: number): Operation => ({ kind: "write", value });
const settle = (): Operation => ({ kind: "settle" });
const dispose = (): Operation => ({ kind: "dispose" });

/** Guaranteed boundary cases, independent of the seeded fuzz trace. */
export function canonicalTraces(program: Program): TraceFamily[] {
  if (program.host === "ssr") return [{ name: "initial", trace: [] }];
  const traces: TraceFamily[] = [
    { name: "branch-enter", trace: [write(1), settle(), dispose()] },
    {
      name: "branch-exit",
      trace: [write(1), settle(), write(0), settle(), dispose()],
    },
    {
      name: "branch-bounce",
      trace: [
        write(1),
        settle(),
        write(0),
        settle(),
        write(2),
        settle(),
        dispose(),
      ],
    },
    {
      name: "same-write",
      trace: [write(1), settle(), write(1), settle(), dispose()],
    },
    {
      name: "on-to-on",
      trace: [write(1), settle(), write(2), settle(), dispose()],
    },
    { name: "dispose-hidden", trace: [write(0), settle(), dispose()] },
    {
      name: "post-dispose-write",
      trace: [write(1), settle(), dispose(), write(2), settle()],
    },
  ];
  if (program.consumer === "for") {
    traces.push({
      name: "keyed-move-insert-delete-return",
      trace: [
        { kind: "list", ids: [2, 3] },
        settle(),
        { kind: "list", ids: [3, 2] },
        settle(),
        { kind: "list", ids: [] },
        settle(),
        { kind: "list", ids: [2] },
        settle(),
        dispose(),
      ],
    });
  }
  return traces;
}

export function traceFeatures(trace: readonly Operation[]): string[] {
  const features: string[] = [];
  const values = trace.flatMap((step) =>
    step.kind === "write" ? [step.value] : [],
  );
  if (
    values.some(
      (value, index) => index > 0 && value > 0 !== values[index - 1]! > 0,
    )
  ) {
    features.push("trace=branch-flip");
  }
  if (values.some((value, index) => index > 0 && value === values[index - 1])) {
    features.push("trace=same-write");
  }
  if (trace.some((step) => step.kind === "dispose"))
    features.push("trace=dispose");
  const disposeIndex = trace.findIndex((step) => step.kind === "dispose");
  if (
    disposeIndex >= 0 &&
    trace
      .slice(disposeIndex + 1)
      .some((step) => step.kind === "write" || step.kind === "list")
  )
    features.push("trace=post-dispose-write");
  if (trace.some((step) => step.kind === "list"))
    features.push("trace=keyed-list");
  return features;
}

/** Delta debugging: keep only operations required to reproduce a divergence. */
export async function shrinkTrace(
  trace: readonly Operation[],
  diverges: (candidate: readonly Operation[]) => Promise<boolean>,
): Promise<Operation[]> {
  let current = [...trace];
  let chunkSize = Math.max(1, Math.floor(current.length / 2));
  while (chunkSize >= 1) {
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkSize) {
      const candidate = [
        ...current.slice(0, start),
        ...current.slice(start + chunkSize),
      ];
      if (await diverges(candidate)) {
        current = candidate;
        reduced = true;
        break;
      }
    }
    if (!reduced) chunkSize = Math.floor(chunkSize / 2);
  }
  return current;
}

/** Reduce optional structure after reducing the execution trace. */
export async function shrinkCase(
  input: Case,
  diverges: (candidate: Case) => Promise<boolean>,
): Promise<Case> {
  let current: Case = {
    program: input.program,
    trace: await shrinkTrace(input.trace, (trace) =>
      diverges({ ...input, trace }),
    ),
  };
  const simplify: readonly ((program: Program) => Program)[] = [
    (program) => ({ ...program, source: "signal" }),
    (program) => ({ ...program, consumer: "jsx" }),
    (program) => ({ ...program, owner: "component" }),
    (program) => ({ ...program, identity: false }),
    (program) => ({ ...program, unrelated: false }),
  ];
  for (const transform of simplify) {
    const candidate = { ...current, program: transform(current.program) };
    if (await diverges(candidate)) current = candidate;
  }
  return current;
}

export interface InteractionCount {
  interaction: string;
  samples: number;
  divergences: number;
}

/** Index observations by feature pairs and triples for diagnostic reporting. */
export function interactionMatrix(
  records: readonly { features: readonly string[]; diverged: boolean }[],
): InteractionCount[] {
  const counts = new Map<string, InteractionCount>();
  for (const record of records) {
    const parts = record.features;
    const keys = [...pairs(parts)];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        for (let k = j + 1; k < parts.length; k++) {
          keys.push(`${parts[i]}|${parts[j]}|${parts[k]}`);
        }
      }
    }
    for (const interaction of keys) {
      const count = counts.get(interaction) ?? {
        interaction,
        samples: 0,
        divergences: 0,
      };
      count.samples++;
      if (record.diverged) count.divergences++;
      counts.set(interaction, count);
    }
  }
  return [...counts.values()].sort((a, b) =>
    a.interaction.localeCompare(b.interaction),
  );
}
