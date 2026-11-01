/**
 * Verdicts of a pairwise trace comparison: whether a candidate runtime agrees
 * with a reference runtime on one program, and if not, whether the difference
 * belongs to an accepted class. One owner for the acceptance rules, shared by
 * oracle.differential.test.ts and the testkit CLI (`testkit diff`).
 *
 * Policies, from strictest:
 *
 * - `exact`: traces must be byte-equal.
 * - `representation`: traces may differ in adjacency order (list-order),
 *   sibling delivery order (event-order) or the incoming edges of a failed
 *   computed (failed-computed), and the candidate may not violate
 *   an invariant the reference does not (SEMANTIC_CONTRACT, "Semantic and
 *   representation equivalence"). For two builds that are both meant to be
 *   correct, as a refactor or a policy change against its parent.
 * - `baseline`: `representation`, plus the corrections of the frozen baseline
 *   the oracle accepts, each only with its own evidence (see
 *   compatibilityClass). For the working tree against the pinned baseline.
 */
import {
  classifyTraceDifference,
  firstMismatch,
  interpret,
  selfInvalidates,
  touchesEpoch,
  type Mismatch,
  type ObservationLevel,
  type Op,
  type Program,
  type RuntimeModule,
} from "./program.ts";

export type VerdictPolicy = "exact" | "representation" | "baseline";

export const VERDICT_POLICIES: readonly VerdictPolicy[] = [
  "exact",
  "representation",
  "baseline",
];

/** Classes of accepted differences, counted per run. */
export type AcceptedClass =
  | "F13"
  | "F15"
  | "F1domain"
  | "F17"
  | "F16"
  | "list-order"
  | "event-order"
  | "failed-computed";

export const ACCEPTED_CLASSES: readonly AcceptedClass[] = [
  "F13",
  "F15",
  "F1domain",
  "F17",
  "F16",
  "list-order",
  "event-order",
  "failed-computed",
];

export type Verdict =
  | { readonly kind: "identical" }
  | { readonly kind: "accepted"; readonly class: AcceptedClass }
  | { readonly kind: "inconclusive"; readonly reason: "stack-limit" }
  | { readonly kind: "divergent"; readonly mismatch: Mismatch | null };

const STACK_OVERFLOW = "RangeError:Maximum call stack size exceeded";
const overflows = (trace: readonly string[]) =>
  trace.some((entry) => entry.includes(STACK_OVERFLOW));

/**
 * A run's trace; with `masked`, its snapshots omit the incoming edges of
 * failed `Changed` computeds (see failedComputedClass).
 */
function observe(
  rt: RuntimeModule,
  program: Program,
  level: ObservationLevel,
  masked: boolean,
  options: { ownEpochDeliveries?: number[] } = {},
): string[] {
  if (!masked) return interpret(rt, program, level, options);
  const maskedSnapshots = new Map<number, string>();
  return interpret(rt, program, level, { ...options, maskedSnapshots }).map(
    (entry, i) => maskedSnapshots.get(i) ?? entry,
  );
}

const violations = (rt: RuntimeModule, program: Program): string[] =>
  interpret(rt, program, "strict", { invariants: true }).filter((entry) =>
    entry.startsWith("invariant:"),
  );
const isLiveness = (entry: string) => entry.startsWith("invariant:liveness:");
const isDelivery = (entry: string | undefined): boolean =>
  entry !== undefined &&
  (entry.startsWith("inv:") ||
    entry.startsWith("inv-owned:") ||
    entry.startsWith("hook-action:"));

/**
 * A difference where the baseline is demonstrably wrong:
 *
 * - F13. The baseline's clock rewinds and wraps, so in a program with an
 *   `epoch` operation a pass can repeat a stamp still carried by a live edge
 *   and the baseline drops a dependency. Accepted only for such a program, only
 *   if the baseline violates a structural invariant and the candidate violates
 *   none.
 * - F15. The baseline leaves a dirty watcher without delivery. Accepted only if
 *   the baseline violates the liveness invariant and the candidate violates
 *   none.
 * - F1 domain. A consumer can invalidate itself during its own evaluation (F1,
 *   open), where liveness is not required. Accepted only if the first
 *   divergence is an extra candidate delivery, or a per-operation snapshot
 *   differs only in the retention flags `Visited | Revalidate` of dirty
 *   watchers. The candidate may violate no invariant outside the known F1
 *   liveness class. These flags distinguish direct from transitive evidence
 *   in the retained-obligation protocol; they are not observable values.
 * - F17. The baseline hands a watcher to the host while that watcher is
 *   inside its own run, after the host released its claim: a pull proof
 *   recomputed a node with a side edge into the validating watcher, whose
 *   current pass already consumes that evidence. Accepted only if the first
 *   divergence is such a baseline delivery and the candidate violates no
 *   invariant.
 * - F16 (fixed in ab5ec15, after the baseline). A watcher cleanup that writes
 *   through a dependency and then throws is recovered to idle by the baseline
 *   while that dependency stays dirty; the candidate keeps `Unknown`. The
 *   liveness invariant does not cover a watcher whose last attempt threw, so
 *   the evidence is the graph state: the program is observed after every
 *   top-level operation (a snapshot added after each, which reads node
 *   fields only), so its first divergence is the earliest state difference,
 *   not a later consequence of it. Accepted only for a program with a watcher
 *   cleanup that writes and throws, only if that first divergence is a
 *   snapshot in which every differing node is a watcher that the baseline
 *   shows clean behind a dirty source and the candidate shows with only
 *   `Unknown` or `Changed` added (and a host claim retained), and only if the candidate violates no
 *   invariant. Found by the swarm family (`pnpm rt diff --families swarm`).
 *
 * The checks run in this order; the first that holds names the class. With
 * `masked`, every trace comparison omits the incoming edges of failed
 * `Changed` computeds (failedComputedClass), so a correction is still
 * recognized next to such a difference; invariants are checked unmasked.
 */
export function compatibilityClass(
  baseline: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  level: ObservationLevel,
  masked = false,
): "F13" | "F15" | "F1domain" | "F17" | "F16" | null {
  if (
    touchesEpoch(program.ops) &&
    violations(baseline, program).some((entry) => !isLiveness(entry)) &&
    violations(candidate, program).length === 0
  )
    return "F13";
  if (
    violations(baseline, program).some(isLiveness) &&
    violations(candidate, program).length === 0
  )
    return "F15";
  if (
    selfInvalidates(program.spec) &&
    violations(candidate, program).every(isLiveness)
  ) {
    // Observe each operation before accepting a later extra delivery. Otherwise
    // a changed producer payload can cause that delivery and be excused as F1.
    const mismatch = checkpointMismatch(baseline, candidate, program, masked);
    if (isDelivery(mismatch?.candidate) || isF1Retention(program, mismatch))
      return "F1domain";
  }
  const ownEpoch: number[] = [];
  const mismatch = firstMismatch(
    observe(baseline, program, level, masked, { ownEpochDeliveries: ownEpoch }),
    observe(candidate, program, level, masked),
  );
  if (
    mismatch !== null &&
    isDelivery(mismatch.baseline) &&
    ownEpoch.includes(mismatch.index) &&
    violations(candidate, program).length === 0
  )
    return "F17";
  if (
    isF16(baseline, candidate, program, masked) &&
    violations(candidate, program).length === 0
  )
    return "F16";
  return null;
}

const DIRTY = 0b11; // Unknown | Changed, fixed by the baseline
const RETAINED = 0b100_0100; // Visited | Revalidate
const SCHEDULED = 0b10_0000;

interface SnapshotNode {
  state: number;
  rest: string;
  sources: number[];
}

function parseSnapshot(entry: string): Map<number, SnapshotNode> | null {
  if (!entry.startsWith("snap:")) return null;
  const nodes = new Map<number, SnapshotNode>();
  for (const match of entry.matchAll(
    /(\d+)\{s(\d+) (v.*?) in\[([^\]]*)\] (out\[[^\]]*\])\}/g,
  )) {
    nodes.set(Number(match[1]), {
      state: Number(match[2]),
      rest: `${match[3]} ${match[5]}`,
      sources: match[4] === "" ? [] : match[4]!.split(",").map(Number),
    });
  }
  return nodes;
}

/** First state difference only: a later unrelated divergence cannot qualify it. */
function checkpointMismatch(
  baseline: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  masked: boolean,
): Mismatch | null {
  const observed: Program = {
    spec: program.spec,
    ops: program.ops.flatMap((op): Op[] => [op, { kind: "snapshot" }]),
  };
  return firstMismatch(
    observe(baseline, observed, "strict", masked),
    observe(candidate, observed, "strict", masked),
  );
}

function isF1Retention(program: Program, mismatch: Mismatch | null): boolean {
  if (mismatch === null) return false;
  const before = parseSnapshot(mismatch.baseline ?? "");
  const after = parseSnapshot(mismatch.candidate ?? "");
  if (before === null || after === null || before.size !== after.size)
    return false;
  const firstWatcher = program.spec.producers + program.spec.consumers.length;
  let differing = 0;
  for (const [id, node] of before) {
    const other = after.get(id);
    if (
      other === undefined ||
      other.rest !== node.rest ||
      other.sources.join() !== node.sources.join()
    )
      return false;
    if (node.state === other.state) continue;
    differing++;
    if (
      id < firstWatcher ||
      (node.state & DIRTY) === 0 ||
      (other.state & ~RETAINED) !== (node.state & ~RETAINED)
    )
      return false;
  }
  return differing > 0;
}

/** The state evidence of F16 (see compatibilityClass). */
function isF16(
  baseline: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  masked: boolean,
): boolean {
  const { spec } = program;
  if (
    !spec.watchers.some(
      (watcher) =>
        watcher.cleanup?.action?.kind === "write" &&
        watcher.cleanup.throwWhen !== undefined,
    )
  )
    return false;
  const mismatch = checkpointMismatch(baseline, candidate, program, masked);
  if (mismatch === null) return false;
  const before = parseSnapshot(mismatch.baseline ?? "");
  const after = parseSnapshot(mismatch.candidate ?? "");
  if (before === null || after === null || before.size !== after.size)
    return false;
  const firstWatcher = spec.producers + spec.consumers.length;
  let differing = 0;
  for (const [id, node] of before) {
    const other = after.get(id);
    if (other === undefined) return false;
    if (
      other.state === node.state &&
      other.rest === node.rest &&
      other.sources.join() === node.sources.join()
    )
      continue;
    differing++;
    const onlyDirtyAdded =
      (node.state & DIRTY) === 0 &&
      (other.state & ~(DIRTY | SCHEDULED)) === (node.state & ~SCHEDULED) &&
      (other.state & SCHEDULED) >= (node.state & SCHEDULED) &&
      (other.state & DIRTY) !== 0 &&
      other.rest === node.rest &&
      other.sources.join() === node.sources.join();
    const behindDirty = node.sources.some(
      (source) => ((before.get(source)?.state ?? 0) & DIRTY) !== 0,
    );
    if (id < firstWatcher || !onlyDirtyAdded || !behindDirty) return false;
  }
  return differing > 0;
}

/**
 * Representation differences: the traces agree once adjacency order
 * (list-order) or, additionally, sibling delivery and execution order
 * (event-order) is not compared, and the candidate violates no invariant the
 * reference does not. Counted, not failed: the reference's representation is
 * not a specification.
 */
export function representationClass(
  reference: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  level: ObservationLevel,
): "list-order" | "event-order" | null {
  const kind = classifyTraceDifference(
    interpret(reference, program, level),
    interpret(candidate, program, level),
  );
  if (kind !== "list-order" && kind !== "event-order") return null;
  const accepted = new Set(violations(reference, program));
  return violations(candidate, program).every((entry) => accepted.has(entry))
    ? kind
    : null;
}

/**
 * A failed computed's incoming relation (SEMANTIC_CONTRACT C1, C3): while a
 * computed node is `Changed` and its last evaluation threw, its incoming
 * edges are retry evidence, not a dependency snapshot, so implementations may
 * keep different ones. The traces must agree, up to the representation
 * classes above, once every snapshot omits exactly those edges (in each run,
 * of the nodes that are failed and `Changed` in that run), and the candidate
 * violates no invariant the reference does not. Every other edge, every
 * value, state, read, execution and delivery is still compared.
 */
export function failedComputedClass(
  reference: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  level: ObservationLevel,
): "failed-computed" | null {
  // Both readings of each side come from one run, so a candidate that
  // differs between runs cannot pass by agreeing on a rerun.
  const run = (rt: RuntimeModule) => {
    const maskedSnapshots = new Map<number, string>();
    const trace = interpret(rt, program, level, { maskedSnapshots });
    return {
      trace,
      masked: trace.map((entry, i) => maskedSnapshots.get(i) ?? entry),
    };
  };
  const expected = run(reference);
  const actual = run(candidate);
  if (classifyTraceDifference(expected.trace, actual.trace) !== "semantic")
    return null;
  if (classifyTraceDifference(expected.masked, actual.masked) === "semantic")
    return null;
  const accepted = new Set(violations(reference, program));
  return violations(candidate, program).every((entry) => accepted.has(entry))
    ? "failed-computed"
    : null;
}

/** Whether the two traces of `program` differ at all (the shrink predicate). */
export function differs(
  reference: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  level: ObservationLevel,
): boolean {
  return (
    firstMismatch(
      interpret(reference, program, level),
      interpret(candidate, program, level),
    ) !== null
  );
}

/**
 * Judges one program. A program whose traces differ while both sides exhaust
 * the call stack is `inconclusive` under every policy: where the stack ends
 * depends on frame sizes and JIT state, so two instances of one build part
 * there too (seed 4218 of the default family). It is reported, never passed
 * and never failed. A side that overflows alone is judged as usual, so an
 * unbounded recursion in the candidate stays a divergence.
 */
export function judge(
  reference: RuntimeModule,
  candidate: RuntimeModule,
  program: Program,
  level: ObservationLevel,
  policy: VerdictPolicy,
): Verdict {
  const expected = interpret(reference, program, level);
  const actual = interpret(candidate, program, level);
  const mismatch = firstMismatch(expected, actual);
  if (mismatch === null) return { kind: "identical" };
  if (overflows(expected) && overflows(actual))
    return { kind: "inconclusive", reason: "stack-limit" };
  if (policy === "baseline") {
    const correction = compatibilityClass(reference, candidate, program, level);
    if (correction !== null) return { kind: "accepted", class: correction };
  }
  if (policy !== "exact") {
    const representation = representationClass(
      reference,
      candidate,
      program,
      level,
    );
    if (representation !== null)
      return { kind: "accepted", class: representation };
    const failedComputed = failedComputedClass(
      reference,
      candidate,
      program,
      level,
    );
    if (failedComputed !== null)
      return { kind: "accepted", class: failedComputed };
  }
  if (policy === "baseline") {
    // A correction of the baseline in a program whose failed computeds also
    // keep different incoming edges: the correction must hold without them.
    const correction = compatibilityClass(
      reference,
      candidate,
      program,
      level,
      true,
    );
    if (correction !== null) return { kind: "accepted", class: correction };
  }
  return { kind: "divergent", mismatch };
}

/**
 * Whether a program is a counterexample under a policy: used as the shrink
 * predicate, so a minimized program still fails for the same reason and not
 * only by differing in an accepted way.
 */
export function rejects(
  reference: RuntimeModule,
  candidate: RuntimeModule,
  level: ObservationLevel,
  policy: VerdictPolicy,
): (program: Program) => boolean {
  return (program) =>
    judge(reference, candidate, program, level, policy).kind === "divergent";
}
