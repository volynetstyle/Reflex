/**
 * JoinFrame<Arity, R>
 *
 * Runtime state machine for join-coordination.
 * Implements J1-J6 invariants and requires A1-A3 algebraic laws on join.
 */
export interface JoinFrame<R> {
  readonly arity: number
  readonly value: R
  readonly arrived: number
  readonly done: boolean
  step(input: R): void
}

/**
 * createJoin
 *
 * Factory for JoinFrame automaton.
 *
 * @param arity Number of events to wait for
 * @param bottom Identity element (bottom of lattice)
 * @param join Binary operation (must be commutative, associative, idempotent)
 * @param rank Function to compute progress: rank(value) → [0, arity]
 * @returns JoinFrame instance
 *
 * Example:
 * ```typescript
 * const jf = createJoin(
 *   3,
 *   0,
 *   (a, b) => Math.max(a, b),
 *   (x) => Math.min(x, 3)
 * )
 * jf.step(5)   // value: 5, arrived: 3, done: true
 * ```
 */
export function createJoin<R>(
  arity: number,
  bottom: R,
  join: (a: R, b: R) => R,
  rank: (value: R) => number,
): JoinFrame<R> {
  // Monomorphic hot path: maintain invariant J2
  let value = bottom
  let arrived = 0
  let done = false

  return {
    arity,
    get value() {
      return value
    },
    get arrived() {
      return arrived
    },
    get done() {
      return done
    },
    step(input: R) {
      // J5: Zero allocation (assumes join/rank allocate, but step itself doesn't)
      value = join(value, input)
      const newArrived = rank(value)
      if (newArrived > arrived) {
        arrived = newArrived
        done = arrived >= arity
      }
      // J3: Idempotent — calling twice with same input doesn't regress state
      // J4: Monomorphic — input type never changes within a JoinFrame instance
    },
  }
}
