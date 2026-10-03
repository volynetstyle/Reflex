import { AsyncProtocolError } from "./errors";

/** Freshness handles belong to async sources, never to ordinary reactive nodes. */
export interface FreshnessDependency {
  /** Intrusive scratch cell, allocated with the source rather than during a walk. */
  readonly [FRONTIER_STATE]: FrontierState;
  ensure(): void;
  /** Check the already-pulled source without recording a reactive edge. */
  validate(): void;
}

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
  return Object.freeze({
    [FRONTIER_STATE]: { bits, visit: 0, min, max },
    entries: Object.freeze(entries),
  });
}

export const EMPTY_FRONTIER: EvaluationFrontier = createFrontier(Empty, []);
const EMPTY_PUBLICATION_FRONTIER: PublicationFrontier = Object.freeze([]);

function isFrontierNode(
  frontier: EvaluationFrontier,
): frontier is FrontierNode {
  return frontier[FRONTIER_STATE].bits !== Leaf;
}

// Walks reuse stack storage. Only reentrant walks journal visitation changes:
// a top-level walk leaves its epoch behind and the next walk simply ignores it.
const stack: (EvaluationFrontier | undefined)[] = [];
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
    if (stack.length > MAX_RETAINED_STACK) stack.length = STACK_TRIM_FLOOR;
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
  let current: EvaluationFrontier = frontier;

  try {
    while (true) {
      const state = current[FRONTIER_STATE];
      if (visitState(state, walk)) {
        if (state.bits === Leaf) {
          const dependency = current as FreshnessDependency;
          if (dependencies !== undefined) dependencies.push(dependency);
          else if (callback !== undefined) {
            high = top;
            callback(dependency);
          }
        } else if (state.bits & Direct) {
          const entries = (current as FrontierNode)
            .entries as readonly FreshnessDependency[];
          for (let i = 0; i < entries.length; ++i) {
            const dependency = entries[i]!;
            if (!visitState(dependency[FRONTIER_STATE], walk)) continue;
            if (dependencies !== undefined) dependencies.push(dependency);
            else if (callback !== undefined) {
              high = top;
              callback(dependency);
            }
          }
        } else if (state.bits & Composite) {
          const entries: readonly EvaluationFrontier[] = (
            current as FrontierNode
          ).entries;
          // Descend into the first child directly; only siblings need stack slots.
          for (let i = entries.length - 1; i > 0; --i)
            stack[top++] = entries[i]!;
          current = entries[0]!;
          continue;
        }
      }
      if (top === base) break;
      current = stack[--top]!;
      stack[top] = undefined;
    }
  } finally {
    releaseWalk(base, top, visitedBase);
  }
}

function containsDependency(
  frontier: EvaluationFrontier,
  target: FreshnessDependency,
): boolean {
  if (frontier === target) return true;
  const id = target[FRONTIER_STATE].min;
  const rootState = frontier[FRONTIER_STATE];
  if (id < rootState.min || id > rootState.max || !isFrontierNode(frontier))
    return false;
  if (rootState.bits & Direct) return frontier.entries.includes(target);
  const base = high;
  let top = base;
  const visitedBase = visitedHigh;
  const walk = beginWalk();
  let current: EvaluationFrontier = frontier;
  try {
    while (true) {
      if (current === target) return true;
      const state = current[FRONTIER_STATE];
      if (
        id >= state.min &&
        id <= state.max &&
        state.bits !== Leaf &&
        visitState(state, walk)
      ) {
        const entries: readonly EvaluationFrontier[] = (current as FrontierNode)
          .entries;
        if (state.bits & Direct) {
          if (entries.includes(target)) return true;
        } else if (state.bits & Composite) {
          for (let i = entries.length - 1; i > 0; --i)
            stack[top++] = entries[i]!;
          current = entries[0]!;
          continue;
        }
      }
      if (top === base) break;
      current = stack[--top]!;
      stack[top] = undefined;
    }
    return false;
  } finally {
    releaseWalk(base, top, visitedBase);
  }
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

export class FrontierBuilder {
  private direct: FreshnessDependency[] | undefined = undefined;
  private directSet: Set<FreshnessDependency> | undefined = undefined;
  private parts: EvaluationFrontier[] | undefined = undefined;
  private inheritedCount = 0;

  constructor(private readonly owner?: FreshnessDependency) {}

  add(dependency: FreshnessDependency): void {
    if (dependency === this.owner)
      throw new AsyncProtocolError("Cyclic async derivation dependency.");

    const directSet = this.directSet;
    if (directSet !== undefined) {
      const size = directSet.size;
      directSet.add(dependency);
      if (directSet.size === size) return;
      this.direct!.push(dependency);
    } else {
      const direct = (this.direct ??= []);
      if (direct.includes(dependency)) return;
      // Linear lookup wins for small packed vectors; promote only when the
      // frontier is wide enough to amortize a Set allocation.
      if (direct.length >= 16) {
        this.directSet = new Set(direct);
        this.directSet.add(dependency);
      }
      direct.push(dependency);
    }

    this.parts?.push(dependency);
  }

  merge(frontier: EvaluationFrontier): void {
    if (frontier === EMPTY_FRONTIER) return;
    if (this.owner !== undefined && containsDependency(frontier, this.owner)) {
      throw new AsyncProtocolError("Cyclic async derivation dependency.");
    }

    const parts = (this.parts ??= this.direct?.slice() ?? []);
    parts.push(frontier);
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
): void {
  activeFrontierCollector?.add(dependency);
}

export function inheritFrontier(frontier: EvaluationFrontier): void {
  activeFrontierCollector?.merge(frontier);
}
