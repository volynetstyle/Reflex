/**
 * JoinSemilattice<T>
 *
 * A semilattice with a binary join operation.
 * Satisfies:
 * - Associativity: join(join(a, b), c) = join(a, join(b, c))
 * - Commutativity: join(a, b) = join(b, a)
 * - Idempotence: join(a, a) = a
 */
export interface JoinSemilattice<T> {
  join: (a: T, b: T) => T
}

/**
 * MeetSemilattice<T>
 *
 * A semilattice with a binary meet operation.
 * Satisfies:
 * - Associativity: meet(meet(a, b), c) = meet(a, meet(b, c))
 * - Commutativity: meet(a, b) = meet(b, a)
 * - Idempotence: meet(a, a) = a
 */
export interface MeetSemilattice<T> {
  meet: (a: T, b: T) => T
}
