/**
 * @file testkit/index.ts
 *
 * Consolidated testkit for OwnershipNode testing.
 * Exports builders, validators, and scenarios for use across test suites.
 *
 * Structure:
 *   - builders: factories and tree builders
 *   - validators: assertion helpers and invariant checks
 *   - scenarios: composable test patterns
 *
 * Usage:
 *   import {
 *     createOwner,
 *     buildOwnershipTree,
 *     assertSiblingChain,
 *     scenarioReparenting,
 *   } from "@reflex/core/testkit";
 */

export {
  // builders
  createOwner,
  buildOwnershipTree,
  createSiblings,
  createChain,
  createTestScope,
  type TreeSpec,
} from "./builders";

export {
  // validators
  collectChildren,
  assertSiblingChain,
  assertDetached,
  assertDisposed,
  assertSubtreeIntegrity,
  assertAlive,
  assertContextIsolation,
  assertContextInheritance,
  assertTreeUnchanged,
  collectAllNodes,
  assertDisposalOrder,
  assertPrototypePollutionGuard,
  PROTO_KEYS,
} from "./validators";

export {
  // scenarios
  scenarioReparenting,
  scenarioMultiAppend,
  scenarioCleanupOrder,
  scenarioCleanupErrorResilience,
  scenarioContextChain,
  scenarioScopeNesting,
  scenarioPostOrderDisposal,
  scenarioBulkRemoval,
  scenarioMutationAfterDisposal,
  scenarioContextAfterReparent,
} from "./scenarios";
