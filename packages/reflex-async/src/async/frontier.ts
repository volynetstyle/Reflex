import { AsyncProtocolError } from "./errors";

export const FRONTIER_STATE: unique symbol = Symbol("reflex.frontier");
const Leaf = 0;
const Empty = 1 << 0;
const Direct = 1 << 1;
const Composite = 1 << 2;

// Numeric epochs avoid allocating a token per walk. Identity tokens preserve
// uniqueness even if a process exhausts the safe integer range.
type Walk = number | object;

interface FrontierState {
  readonly bits: number;
  /** Last walk; nested traversals restore the interrupted walk's epoch. */
  visit: Walk;
  /** Conservative bounds on reachable source IDs; proof bounds never change. */
  readonly min: number;
  readonly max: number;
}

let dependencyId = 0;

export function createFreshnessState(): FrontierState {
  // Saturation can only make a range less selective; identity still decides
  // membership, so exhausting safe integer IDs cannot hide a cycle.
  if (dependencyId < Number.MAX_SAFE_INTEGER) ++dependencyId;
  return { bits: Leaf, visit: 0, min: dependencyId, max: dependencyId };
}

/** Every proof node has the same layout; the private tag also carries its bits. */
interface FrontierNode {
  readonly [FRONTIER_STATE]: FrontierState;
  /** Direct leaves or ordered leaves and inherited proofs, depending on the bits. */
  readonly entries: readonly EvaluationFrontier[];
}

/** Freshness handles belong to async sources, never to ordinary reactive nodes. */
export interface FreshnessDependency {
  /** Intrusive scratch cell, allocated with the source rather than during a walk. */
  readonly [FRONTIER_STATE]: FrontierState;
  ensure(): void;
  /** Check the already-pulled source without recording a reactive edge. */
  validate(): void;
}

/** Shared, immutable proof expression produced while evaluating async work. */
export type EvaluationFrontier = FreshnessDependency | FrontierNode;

/** Flat, distinct obligations used by pull and publication checkpoints. */
export type PublicationFrontier = readonly FreshnessDependency[];

function createFrontier(
  bits: number,
  entries: EvaluationFrontier[],
): FrontierNode {
  // Fold child summaries once per snapshot, keeping capture free of range
  // updates and avoiding any traversal of the children's transitive graphs.
  let min = Infinity;
  let max = 0;

  for (let i = 0; i < entries.length; ++i) {
    const state = entries[i]![FRONTIER_STATE];
    if (state.min < min) min = state.min;
    if (state.max > max) max = state.max;
  }

  return {
    [FRONTIER_STATE]: { bits, visit: 0, min, max },
    entries: entries,
  };
}

export const EMPTY_FRONTIER: EvaluationFrontier = createFrontier(Empty, []);
const EMPTY_PUBLICATION_FRONTIER: PublicationFrontier = [];

function isFrontierNode(
  frontier: EvaluationFrontier,
): frontier is FrontierNode {
  return frontier[FRONTIER_STATE].bits !== Leaf;
}

// Walks reuse stack storage. Only reentrant walks journal visitation changes:
// a top-level walk leaves its epoch behind and the next walk simply ignores it.
// A frame suspends a composite scan: its entries and the next index, so wide
// proofs are scanned in place rather than copied sibling by sibling. A single
// remaining sibling is stored directly (cursor SIBLING), which keeps chains
// that inherit their prefix first as cheap as a sibling stack.
const stack: (
  | readonly EvaluationFrontier[]
  | EvaluationFrontier
  | undefined
)[] = [];
const cursors: number[] = [];
const SIBLING = -1;
let high = 0;
const visitedStates: (FrontierState | undefined)[] = [];
const previousVisits: Walk[] = [];
let visitedHigh = 0;
let depth = 0;
let epoch = 0;
const STACK_TRIM_FLOOR = 512;
const MAX_RETAINED_STACK = STACK_TRIM_FLOOR * 4;

function beginWalk(): Walk {
  ++depth;
  return epoch < Number.MAX_SAFE_INTEGER ? ++epoch : {};
}

function visitState(state: FrontierState, walk: Walk): boolean {
  if (state.visit === walk) return false;
  if (depth > 1) {
    visitedStates[visitedHigh] = state;
    previousVisits[visitedHigh++] = state.visit;
  }
  state.visit = walk;
  return true;
}

function releaseWalk(base: number, top: number, visitedBase: number): void {
  // Release references on success, early search exit and callback failure.
  while (top !== base) stack[--top] = undefined;

  high = base;

  while (visitedHigh !== visitedBase) {
    const index = --visitedHigh;
    const state = visitedStates[index]!;
    visitedStates[index] = undefined;
    state.visit = previousVisits[index]!;
    previousVisits[index] = 0;
  }

  if (--depth === 0) {
    if (stack.length > MAX_RETAINED_STACK) {
      stack.length = STACK_TRIM_FLOOR;
      cursors.length = STACK_TRIM_FLOOR;
    }
    if (visitedStates.length > MAX_RETAINED_STACK) {
      visitedStates.length = STACK_TRIM_FLOOR;
      previousVisits.length = STACK_TRIM_FLOOR;
    }
  }
}

/** Composite DFS shared by materialization and callback traversal. */
function walkFrontier(
  frontier: FrontierNode,
  dependencies: FreshnessDependency[] | undefined,
  callback: ((dependency: FreshnessDependency) => void) | undefined,
): void {
  const base = high;
  let top = base;
  const visitedBase = visitedHigh;
  const walk = beginWalk();
  // The DAG is acyclic, so the root needs no visitation mark of its own.
  let entries: readonly EvaluationFrontier[] = frontier.entries;
  let next = 0;

  try {
    while (true) {
      let entry: EvaluationFrontier;
      if (next !== entries.length) entry = entries[next++]!;
      else {
        if (top === base) break;
        const saved = stack[--top]!;
        stack[top] = undefined;
        const cursor = cursors[top]!;
        if (cursor === SIBLING) entry = saved as EvaluationFrontier;
        else {
          entries = saved as readonly EvaluationFrontier[];
          next = cursor;
          continue;
        }
      }
      const state = entry[FRONTIER_STATE];
      if (!visitState(state, walk)) continue;
      if (state.bits === Leaf) {
        const dependency = entry as FreshnessDependency;
        if (dependencies !== undefined) dependencies.push(dependency);
        else if (callback !== undefined) {
          high = top;
          callback(dependency);
        }
      } else if (state.bits & Direct) {
        const leaves = (entry as FrontierNode)
          .entries as readonly FreshnessDependency[];
        for (let i = 0; i < leaves.length; ++i) {
          const dependency = leaves[i]!;
          if (!visitState(dependency[FRONTIER_STATE], walk)) continue;
          if (dependencies !== undefined) dependencies.push(dependency);
          else if (callback !== undefined) {
            high = top;
            callback(dependency);
          }
        }
      } else if (state.bits & Composite) {
        const remaining = entries.length - next;
        if (remaining === 1) {
          stack[top] = entries[next]!;
          cursors[top++] = SIBLING;
        } else if (remaining !== 0) {
          stack[top] = entries;
          cursors[top++] = next;
        }
        entries = (entry as FrontierNode).entries;
        next = 0;
      }
    }
  } finally {
    releaseWalk(base, top, visitedBase);
  }
}

export function containsDependency(
  frontier: EvaluationFrontier,
  target: FreshnessDependency,
): boolean {
  if (
    frontier === target ||
    frontier[FRONTIER_STATE] === target[FRONTIER_STATE]
  )
    return true;

  const id = target[FRONTIER_STATE].min;
  const rootState = frontier[FRONTIER_STATE];

  if (id < rootState.min || id > rootState.max || !isFrontierNode(frontier))
    return false;
  if (rootState.bits & Direct) return containsSource(frontier.entries, target);

  const base = high;
  let top = base;
  const visitedBase = visitedHigh;
  const walk = beginWalk();
  const targetState = target[FRONTIER_STATE];
  let entries: readonly EvaluationFrontier[] = frontier.entries;
  let next = 0;

  try {
    while (true) {
      let entry: EvaluationFrontier;
      if (next !== entries.length) entry = entries[next++]!;
      else {
        if (top === base) break;
        const saved = stack[--top]!;
        stack[top] = undefined;
        const cursor = cursors[top]!;
        if (cursor === SIBLING) entry = saved as EvaluationFrontier;
        else {
          entries = saved as readonly EvaluationFrontier[];
          next = cursor;
          continue;
        }
      }
      const state = entry[FRONTIER_STATE];
      if (state === targetState) return true;
      // Leaves of other sources and out-of-range proofs are pruned unvisited.
      if (
        state.bits === Leaf ||
        id < state.min ||
        id > state.max ||
        !visitState(state, walk)
      )
        continue;
      if (state.bits & Direct) {
        if (containsSource((entry as FrontierNode).entries, target))
          return true;
      } else if (state.bits & Composite) {
        const remaining = entries.length - next;
        if (remaining === 1) {
          stack[top] = entries[next]!;
          cursors[top++] = SIBLING;
        } else if (remaining !== 0) {
          stack[top] = entries;
          cursors[top++] = next;
        }
        entries = (entry as FrontierNode).entries;
        next = 0;
      }
    }
    return false;
  } finally {
    releaseWalk(base, top, visitedBase);
  }
}

/** Failure observations share their source's identity and visitation cell. */
function containsSource(
  entries: readonly EvaluationFrontier[],
  target: FreshnessDependency,
): boolean {
  const state = target[FRONTIER_STATE];
  for (let i = 0; i < entries.length; ++i)
    if (entries[i]![FRONTIER_STATE] === state) return true;
  return false;
}

/** Pure conversion to distinct leaves in capture order; the caller owns memoization. */
export function materializeFrontier(
  frontier: EvaluationFrontier,
): PublicationFrontier {
  if (frontier === EMPTY_FRONTIER) return EMPTY_PUBLICATION_FRONTIER;
  if (!isFrontierNode(frontier)) return [frontier];
  if (frontier[FRONTIER_STATE].bits & Direct) {
    const entries = frontier.entries as readonly FreshnessDependency[];
    // Frozen arrays take the generic slice path in V8. Copy by index while
    // keeping the publication vector private to its consumer.
    const dependencies = new Array<FreshnessDependency>(entries.length);
    for (let i = 0; i < entries.length; ++i) dependencies[i] = entries[i]!;
    return dependencies;
  }

  const dependencies: FreshnessDependency[] = [];
  walkFrontier(frontier, dependencies, undefined);
  return dependencies.length === 0 ? EMPTY_PUBLICATION_FRONTIER : dependencies;
}

/** Visit each dependency once without retaining a publication vector. */
export function forEachDependency(
  frontier: EvaluationFrontier,
  callback: (dependency: FreshnessDependency) => void,
): void {
  if (frontier === EMPTY_FRONTIER) return;
  if (!isFrontierNode(frontier)) {
    callback(frontier);
    return;
  }

  if (frontier[FRONTIER_STATE].bits & Direct) {
    const entries = frontier.entries as readonly FreshnessDependency[];
    for (let i = 0; i < entries.length; ++i) callback(entries[i]!);
    return;
  }
  walkFrontier(frontier, undefined, callback);
}

/** Conservative local comparison: different shapes may have the same leaves. */
export function sameFrontierShape(
  left: EvaluationFrontier,
  right: EvaluationFrontier,
): boolean {
  if (left === right) return true;
  if (!isFrontierNode(left) || !isFrontierNode(right)) return false;
  if (left[FRONTIER_STATE].bits !== right[FRONTIER_STATE].bits) return false;

  const a = left.entries;
  const b = right.entries;

  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * One obligation per freshness state; the first observation represents it.
 * Observations of one source share `ensure()` and differ only in which outcome
 * `validate()` accepts. Outcomes never recur, so a later observation implies the
 * source left every earlier outcome, and the first check is exactly as strong
 * as checking all of them. Direct capture and composite walks share this key.
 */
export class FrontierBuilder {
  private direct: FreshnessDependency[] | undefined = undefined;
  private directSet: Set<FrontierState> | undefined = undefined;
  private parts: EvaluationFrontier[] | undefined = undefined;
  private inheritedCount = 0;
  /** Set once `direct` may hold a witness other than its source's own handle. */
  private aliased = false;

  constructor(private readonly owner?: FreshnessDependency) {}

  /** `dependency` is the source's canonical handle; `observation` its witness. */
  add(dependency: FreshnessDependency, observation = dependency): void {
    if (dependency === this.owner)
      throw new AsyncProtocolError("Cyclic async derivation dependency.");
    if (
      observation === dependency &&
      !this.aliased &&
      this.directSet === undefined
    ) {
      // While every direct entry is a canonical handle, state equality is
      // reference equality and the builtin search stays exact.
      const direct = (this.direct ??= []);
      if (direct.includes(observation)) return;
      if (direct.length < 16) {
        direct.push(observation);
        this.parts?.push(observation);
        return;
      }
    }
    this.record(observation, observation === dependency);
  }

  private record(observation: FreshnessDependency, canonical: boolean): void {
    const state = observation[FRONTIER_STATE];
    const directSet = this.directSet;
    if (directSet !== undefined) {
      const size = directSet.size;
      directSet.add(state);
      if (directSet.size === size) return;
      this.direct!.push(observation);
    } else {
      const direct = (this.direct ??= []);
      for (let i = 0; i < direct.length; ++i)
        if (direct[i]![FRONTIER_STATE] === state) return;
      // Linear lookup wins for small packed vectors; promote only when the
      // frontier is wide enough to amortize a Set allocation.
      if (direct.length >= 16) {
        const states = new Set<FrontierState>();
        for (let i = 0; i < direct.length; ++i)
          states.add(direct[i]![FRONTIER_STATE]);
        this.directSet = states.add(state);
      }
      direct.push(observation);
    }
    if (!canonical) this.aliased = true;
    this.parts?.push(observation);
  }

  merge(frontier: EvaluationFrontier): void {
    if (frontier === EMPTY_FRONTIER) return;
    const owner = this.owner;
    if (!isFrontierNode(frontier)) {
      // A singleton proof is one observation: capture deduplicates it, and
      // captures of only leaves keep the Direct fast paths.
      if (
        owner !== undefined &&
        frontier[FRONTIER_STATE] === owner[FRONTIER_STATE]
      )
        throw new AsyncProtocolError("Cyclic async derivation dependency.");
      this.record(frontier, false);
      return;
    }

    // Repeated reads of one cached evaluation inherit the same immutable
    // proof. A ⋆ A = A, and its owner search has already passed.
    const parts = this.parts;
    if (parts !== undefined && parts[parts.length - 1] === frontier) return;
    if (owner !== undefined && containsDependency(frontier, owner)) {
      throw new AsyncProtocolError("Cyclic async derivation dependency.");
    }

    (this.parts ??= this.direct?.slice() ?? []).push(frontier);
    ++this.inheritedCount;
  }

  snapshot(): EvaluationFrontier {
    if (this.parts === undefined) {
      const direct = this.direct;
      if (direct === undefined || direct.length === 0) return EMPTY_FRONTIER;
      if (direct.length === 1) return direct[0]!;
      return createFrontier(Direct, direct.slice());
    }

    if (this.direct === undefined && this.inheritedCount === 1)
      return this.parts[0]!;

    return createFrontier(Composite, this.parts.slice());
  }
}

// Computed evaluations and async bodies collect independently of execution API lifetime.
let activeFrontierCollector: FrontierBuilder | undefined;

export function hasFrontierCollector(): boolean {
  return activeFrontierCollector !== undefined;
}

export function withFrontierCollector<T>(
  collector: FrontierBuilder,
  expression: () => T,
): T {
  const parent = activeFrontierCollector;
  activeFrontierCollector = collector;
  try {
    return expression();
  } finally {
    activeFrontierCollector = parent;
  }
}

export function recordFreshnessDependency(
  dependency: FreshnessDependency,
  observation = dependency,
): void {
  activeFrontierCollector?.add(dependency, observation);
}

export function inheritFrontier(frontier: EvaluationFrontier): void {
  activeFrontierCollector?.merge(frontier);
}
