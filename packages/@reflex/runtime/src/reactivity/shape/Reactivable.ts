/**
 * Marker interface for all reactive entities participating
 * in the runtime graph.
 *
 * Architectural role:
 *   - Defines the common root type for nodes, signals,
 *     computations, effects, and other reactive primitives.
 *   - Enables structural polymorphism across the runtime.
 *
 * Semantics:
 *   - This interface intentionally declares no members.
 *   - Concrete reactive types define their own operational
 *     state and invariants.
 *
 * Design intent:
 *   - Acts as a type-level boundary for the reactive subsystem.
 *   - Prevents non-reactive structures from being treated
 *     as runtime graph participants.
 *
 * Runtime guarantees:
 *   - Implementations must participate in the propagation model.
 *   - Lifecycle, scheduling, and versioning policies are defined
 *     by the runtime layer, not by this interface.
 *
 * Note:
 *   This is a nominal grouping construct, not a behavioral contract.
 */
interface Reactivable {}

export type { Reactivable };