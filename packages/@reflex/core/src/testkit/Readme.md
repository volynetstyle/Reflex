# Ownership Testing Toolkit

Consolidated test utilities for `OwnershipNode` and ownership system validation.

## Structure

### 1. **Builders** (`builders.ts`)

Factory functions for constructing test data and common ownership structures.

```typescript
// Simple owner creation
const root = createOwner(); // OwnershipNode.createRoot()
const child = createOwner(parent); // parent.createChild()

// Build complex trees declaratively
const root = buildOwnershipTree({
  children: [
    { 
      context: { level: 1 },
      children: [{ children: [] }],
      cleanups: 2 
    },
    { children: [] }
  ]
});

// Create sibling lists for testing
const siblings = createSiblings(parent, 10);

// Create depth-first chains
const chain = createChain(5); // root -> child -> grandchild -> ...
```

### 2. **Validators** (`validators.ts`)

Assertion helpers that replace repetitive validation code in tests.

#### Structural Validators

```typescript
// Collect children in order
const children = collectChildren(parent);

// Assert sibling chain consistency (parent pointers, link symmetry, count)
assertSiblingChain(parent);

// Assert node is detached
assertDetached(orphan);

// Assert full structural cleanup after disposal
assertDisposed(node, deep: false);

// Assert entire subtree integrity recursively
assertSubtreeIntegrity(root);

// Assert node is not disposed
assertAlive(node);
```

#### Context Validators

```typescript
// Verify context isolation between parent and child
assertContextIsolation(parent, child, "key", parentValue, childValue);

// Verify context inheritance
assertContextInheritance(parent, child, "key", inheritedValue);

// Verify tree structure unchanged
assertTreeUnchanged(parent, expectedChildren);
```

#### Traversal Helpers

```typescript
// Collect all nodes in subtree (post-order DFS)
const allNodes = collectAllNodes(root);

// Verify disposal order matches post-order traversal
assertDisposalOrder(disposalOrder, root);

// Check prototype pollution guards
assertPrototypePollutionGuard(node);
```

### 3. **Scenarios** (`scenarios.ts`)

Composable test patterns that reduce boilerplate by capturing common workflows.

```typescript
// Test reparenting: child moves from oldParent to newParent
scenarioReparenting(oldParent, newParent, child);

// Test multiple appends maintain order
scenarioMultiAppend(parent, 50);

// Test cleanup LIFO order
const [order, node] = scenarioCleanupOrder(owner);
// order === [3, 2, 1]

// Test cleanup error resilience
const { executed, errorLogged } = scenarioCleanupErrorResilience(owner);
// executed === [1, 3] (despite error at index 2)

// Test context inheritance chain (parent -> child -> grandchild)
const { nodes, values } = scenarioContextChain(5);

// Test scope nesting with error recovery
const { outer, inner } = scenarioScopeNesting(root, throwInInner);

// Test post-order disposal
const { disposalOrder, allNodes } = scenarioPostOrderDisposal(root);

// Test bulk sibling removal
const { removed, remaining } = scenarioBulkRemoval(parent, 100, 3);

// Test mutations after disposal are safe
const { disposedParent, orphan } = scenarioMutationAfterDisposal(parent);

// Test context behavior after reparenting
const { child, originalValue, afterReparent } = scenarioContextAfterReparent(p1, p2);
```

## Usage Examples

### Basic Test

```typescript
import { describe, it, expect } from "vitest";
import {
  createOwner,
  assertSiblingChain,
  scenarioReparenting,
} from "@reflex/core/testkit";

describe("Ownership", () => {
  it("maintains sibling consistency", () => {
    const parent = createOwner();
    for (let i = 0; i < 10; i++) {
      parent.createChild();
    }

    assertSiblingChain(parent); // All checks in one call
  });

  it("safe reparenting", () => {
    const p1 = createOwner();
    const p2 = createOwner();
    const c = createOwner(null);

    scenarioReparenting(p1, p2, c); // All assertions included
  });
});
```

### Tree Building

```typescript
import { buildOwnershipTree, assertSubtreeIntegrity } from "@reflex/core/testkit";

describe("Tree Operations", () => {
  it("complex tree", () => {
    const root = buildOwnershipTree({
      context: { root: true },
      cleanups: 1,
      children: [
        {
          context: { level: 1, branch: "a" },
          children: [{ children: [] }, { children: [] }],
        },
        {
          context: { level: 1, branch: "b" },
          children: [{ children: [{ children: [] }] }],
        },
      ],
    });

    assertSubtreeIntegrity(root);
    root.dispose();
  });
});
```

### Scenario-Based Testing

```typescript
import {
  createChain,
  scenarioPostOrderDisposal,
  assertDisposed,
} from "@reflex/core/testkit";

describe("Disposal Safety", () => {
  it("post-order with deep tree", () => {
    const root = createChain(10);
    const { disposalOrder } = scenarioPostOrderDisposal(root);

    expect(disposalOrder.length).toBe(10);
    for (const node of disposalOrder) {
      assertDisposed(node);
    }
  });
});
```

## Benefits

1. **Reduced Duplication**: Common patterns (sibling validation, tree building) defined once
2. **Clearer Intent**: Scenario names make tests self-documenting
3. **Better Coverage**: Composable validators catch edge cases systematically
4. **Maintainability**: Changes to invariants propagate via testkit, not scattered tests
5. **Consistency**: All tests use same assertion vocabulary

## Invariants Covered

- **I. Structural**: Single parent, sibling chains, child count accuracy, safe reparenting
- **II. Context**: Lazy initialization, inheritance without mutation, prototype pollution guards
- **III. Cleanup**: Lazy allocation, LIFO order, idempotent disposal, error resilience
- **IV. Disposal**: Post-order traversal, skip disposed nodes, full structural cleanup
- **V. State**: Safe mutations after disposal
- **VI. Scope**: Isolation, nesting, restoration even on error
- **VII. Context Chain**: Ownership vs inheritance, chain integrity after mutations
- **VIII. Errors**: Cleanup resilience, disposal idempotency

## Export Points

- **Core testkit**: `@reflex/core/testkit` (this module)
- **In tests**: `../testkit` (relative import)
- **Shared testkit**: Can be re-exported from `@reflex/algebra/testkit` for other packages

## Design Principles

1. **No Test Doubles**: Uses real `OwnershipNode` instances, not mocks
2. **Declarative Builders**: Tree construction is readable and expressive
3. **Reusable Validators**: Assertion helpers work on any tree configuration
4. **Scenario Composition**: Tests combine scenarios for complex workflows
5. **Safe Defaults**: All functions handle edge cases gracefully
