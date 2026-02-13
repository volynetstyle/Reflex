import type { GraphEdge, GraphNode, OwnershipNode } from "@reflex/core";
import { RUNTIME_MASK } from "./ReactiveMeta";

/**
 * ReactiveNode.meta (32-bit)
 *
 * [ 0–3  ] NodeKind        (what this node IS)
 * [ 4–7  ] — unused       (reserved, runtime lives elsewhere)
 * [ 8–15 ] NodeStructure  (graph / ownership shape)
 * [ 16–31] NodeCausalCaps (what causal features node USES)
 *
 * IMPORTANT:
 * - meta NEVER changes on hot-path
 * - meta does NOT encode dynamic state
 */

// + [ Reactive Value ]
// + [ Dependency Graph ]
// - [ Execution / Scheduler ]
// + [ Ownership / Lifetime ]

class ReactiveRoot {
  /** Domain / graph id */
  readonly id: number = 0;

  /** Monotonic causal time (ticks on commit) */
  t: number = 0;

  /** Async generation (increments on async boundary) */
  p: number = 0;
}

const causalZone = new ReactiveRoot();

interface Reactivable {}

interface ReactiveNode extends Reactivable {}

class ReactiveNode<T = unknown> implements GraphNode {
  /**
   * Invariants:
   *
   * 1. v increases IFF payload semantically changes
   * 2. s increases IFF dependency graph shape changes
   * 3. p changes only at async boundaries
   * 4. t is monotonic within root, but local to scheduling
   *
   * (t, v, p, s) are NEVER packed, NEVER masked together
   */

  /** Local causal time observed by this node */
  t: number = 0;
  /** Semantic version (value changes only) */
  v: number = 0;
  /** Async layer version */
  p: number = 0;
  /** Structural version (deps shape) */
  s: number = 0;

  root: ReactiveRoot = causalZone;
  /**
   * meta invariants:
   *
   * - meta is immutable after construction
   * - meta describes WHAT node is allowed to do
   * - meta does NOT describe WHAT node is doing now
   *
   * Examples:
   * - NodeKind.Computed
   * - NodeStructure.DynamicDeps
   * - NodeCausal.AsyncBoundary
   *
   *  Kind + structure flags + causal capabilities
   */
  readonly meta: number;

  /**
   * runtime invariants:
   *
   * - runtime flags are execution-only
   * - runtime flags MUST NOT affect causality
   * - runtime flags MUST NOT be read on hot-path
   *
   * If removing runtime flags does not change values,
   * they are in the right place.
   *
   * Runtime flags:
   * - Dirty
   * - Scheduled
   * - Computing
   * - HasError
   *
   * NEVER used in causality checks
   */
  runtime: number = 0;

  firstOut: GraphEdge | null = null;
  lastOut: GraphEdge | null = null;
  outCount = 0;

  firstIn: GraphEdge | null = null;
  lastIn: GraphEdge | null = null;
  inCount = 0;

  payload!: T;
  compute?: () => T;

  lifecycle: OwnershipNode | null = null;

  constructor(meta: number, payload: T, compute?: () => T) {
    this.meta = meta | 0;
    this.payload = payload;
    this.compute = compute;
  }
}

export { ReactiveRoot };
export type { Reactivable, ReactiveNode };
export default ReactiveNode;

type Phase = number;

type Alive = { readonly alive: unique symbol };
type Dead = { readonly dead: unique symbol };

interface Continuation<T> {
  onValue(value: T): void;
  onError(e: unknown): void;
  onComplete(): void;
}

interface CancellationToken<S> {
  cancel(): S extends Alive ? CancellationToken<Dead> : never;
}

interface AsyncSource<T> {
  register(k: Continuation<T>, p: Phase): CancellationToken<Alive>;
}

/**
 * PhaseContext models async causality.
 *
 * Each advance() creates a new async generation.
 * Values from older phases are ignored.
 *
 * This is equivalent to comparing node.p with root.p.
 */

class PhaseContext {
  private _p: Phase = 0;

  get current(): Phase {
    return this._p;
  }

  advance(): Phase {
    return ++this._p;
  }
}

class Token implements CancellationToken<Alive> {
  private cancelled = false;

  cancel(): CancellationToken<Dead> {
    return (
      (this.cancelled = true),
      this as unknown as CancellationToken<Dead>
    );
  }

  get alive(): boolean {
    return !this.cancelled;
  }
}

function inAsyncPhase<T>(
  src: AsyncSource<T>,
  ctx: PhaseContext,
): AsyncSource<T> {
  return {
    register(k, p) {
      const token = new Token();
      const valid = () => token.alive && ctx.current === p;

      const srcToken = src.register(
        {
          onValue(v) {
            if (valid()) k.onValue(v);
          },
          onError(e) {
            if (valid()) k.onError(e);
          },
          onComplete() {
            if (valid()) k.onComplete();
          },
        },
        p,
      );

      return {
        cancel() {
          token.cancel();
          srcToken.cancel();
          return this as unknown as CancellationToken<Dead>;
        },
      } as CancellationToken<Alive>;
    },
  };
}
