# Recompute Walker Manual

This note is for engineers changing `shouldRecomputeWalk()` in `recompute.branch.ts`.

## What This Walker Decides

`shouldRecomputeWalk(node, firstIn)` answers one question:

`Does this dirty consumer actually need a recompute right now?`

It does that by walking incoming dependency edges and stopping at the first proof that an upstream dependency changed in a way that matters. If no such proof is found, it clears `Invalid` on the way back out.

## The Mental Model

Think of the walk as a depth-first search over incoming edges with one shared stack:

1. Start at the consumer's first incoming edge.
2. Inspect the current dependency.
3. If that dependency has its own deps, descend into them.
4. If a branch arm becomes a straight chain, stay in the inner loop and keep walking it.
5. If an arm is proven clean, scan later siblings before unwinding.
6. If an arm is proven changed, propagate that fact upward during unwind.
7. Restore the stack high-water mark before every return.

The walker is "unified" because it handles both:

- simple chains
- branching diamonds / trees

without switching to a separate top-level algorithm.

## Core Variables

- `link`: the current incoming edge being inspected
- `consumer`: the node that owns `link`
- `stack`: shared edge stack reused across calls
- `stackTop`: current logical top for this invocation
- `stackBase`: logical floor that must be restored before return
- `changed`: whether the current subtree has proven a meaningful upstream change

## Control Flow, Step By Step

### 1. Enter the walk

The caller already handled:

- disposed / producer early exits
- `Changed` fast exits
- empty dependency lists

So this walker starts only when a dirty consumer actually has at least one dependency.

### 2. Run the inner descent loop

The inner `while (true)` is the hot path.

At each step:

1. If `consumer.state & Changed`, mark `changed = true` and start unwinding.
2. Read `dep = link.from`.
3. If `dep.state & Changed`, call `refreshAndPropagateIfNeeded(dep, hasFanout(link))`.
4. If `dep.state & Invalid` and it has children, push the current `link` and descend.
5. If that child list is a single chain (`deps.nextIn === null`), stay in the inner loop.
6. If `dep.state & Invalid` but has no children, refresh it now.
7. If the dep is already clean, clear `Invalid` on the current consumer and continue sibling/unwind logic.

### 3. Descend into child deps

When a dirty dependency has its own incoming edges:

1. Push the current edge onto `stack`.
2. Move `link` to `dep.firstIn`.
3. Move `consumer` to `dep`.
4. Update `shouldRecomputeStackHigh`.

From there:

- if the child immediately branches, jump back to the outer loop
- if the child is a straight chain, keep walking in the inner loop

### 4. Handle a clean arm correctly

This is the part most likely to regress.

When the current dep is already clean:

1. Clear `Invalid` on the current consumer.
2. Check `link.nextIn` first.
3. If a later sibling exists, inspect that sibling before unwinding.
4. Only when no sibling exists do we pop to the parent frame.

This ordering matters. If you unwind before checking `link.nextIn`, later siblings can be skipped.

### 5. Unwind after a proof of change

Once `changed === true`, the walker stops searching sideways in that subtree.

On unwind:

1. Pop `parentLink`.
2. Refresh the child consumer upward through `parentLink`.
3. Set `consumer = parentLink.to`.
4. Continue until `stackTop === stackBase`.

If the propagated change collapses to "no meaningful value change", `changed` can become `false` again, and sibling scanning resumes at the appropriate parent depth.

### 6. Exit cleanly

Every return path must restore:

- `shouldRecomputeStackHigh = stackBase`
- sparse stack trimming via `restoreShouldRecomputeStackBase(...)`

Do not add a return path that skips this cleanup.

## Invariants You Must Preserve

1. Later siblings must still be scanned when an earlier sibling is clean.
2. `Invalid` must be cleared on consumers proven clean.
3. `changed` may flip back to `false` after `refreshAndPropagateIfNeeded(...)`.
4. The shared stack slice owned by this invocation is exactly `[stackBase, stackTop)`.
5. Every exit path restores the stack base.
6. `link` must always refer to the edge whose sibling chain is currently being scanned.

## Common Failure Modes

### Skipping later siblings

Symptom:

- first branch arm is clean
- second arm is changed
- walker returns `false`

Typical cause:

- unwinding before checking `link.nextIn`

### Reusing the wrong edge after unwind

Symptom:

- walker revisits a stale leaf edge
- sibling scanning happens at the wrong depth

Typical cause:

- not restoring `link = parentLink` before using parent sibling state

### Leaking stack ownership

Symptom:

- later calls see incorrect stack high-water marks
- weird cross-call traversal corruption

Typical cause:

- adding a new return path without `restoreShouldRecomputeStackBase(...)`

## How To Modify This File Safely

1. Change one control-flow region at a time.
2. Re-check every `return`, `continue`, and `break`.
3. Verify which variable owns the current depth: `link`, `consumer`, and top of stack must agree.
4. Re-run walker-focused tests first.

Recommended test command:

```bash
pnpm --filter @reflex/runtime exec vitest run tests/runtime.walkers.test.ts
```

If you change unwind or sibling logic, also inspect tests covering:

- later sibling scanning after a clean first arm
- same-value recomputes that clear `Invalid`
- nested diamonds / elongated branch arms

## Quick Read Checklist

Before shipping a change, ask:

- Does a clean left branch still allow scanning the right branch?
- Does a changed child still propagate upward through parent fanout?
- If refresh says "same value", can the walker resume sibling scanning?
- Does every early exit restore the shared stack base?
