# AGENTS.md

## Mission
This package is a sync-first reactive runtime.

Priority order:
1. correctness
2. topology invariants
3. hot-path predictability
4. p99 stability

## Core Rules
- Do not touch hot code until the hot path is proven.
- Every perf claim must name the function, code region, and workload.
- Prefer fast path / slow path split over one universal clever path.
- Keep hot paths short, boring, and predictable.
- Avoid shape churn on hot objects.
- Avoid polymorphic property access and unstable call-sites in hot code.
- Do not mix broad refactors with local perf patches.

## P0: Evidence First
- No optimization without a named hot function.
- No optimization without a workload that reproduces the cost.
- No optimization without profile evidence: flamegraph, CPU profile, or benchmark that isolates the cost center.
- No "it seems branchy" or "this probably allocates a lot" language without proof.
- If code is not in the top profile, it is not P0.

For every perf hypothesis, tie it to exactly one main mechanism:
- shape churn
- polymorphic property access
- polymorphic call-site
- deopt risk
- branch-heavy loop
- expensive traversal

## P0: Hot Path Must Be Boring
- No rare logic in the hot loop.
- No debug/dev work in the hot loop.
- No universal smart dispatcher in the hot loop.
- No unnecessary function calls in the hot loop.
- No deep `if / else if / else if / else if` ladders in the hot loop.
- Hot path must have one dominant scenario that covers most executions.
- Everything outside the dominant scenario belongs in a slow path.

Red flag:
- A function that "handles everything" has probably already lost.

## P0: Shape Stability Is Mandatory
- Every hot object must be created with its full field set up-front.
- Fields must be initialized in the same order every time.
- Do not lazily add hot fields after creation.
- Do not use `delete` on hot objects.
- Do not turn a data object into a mode/dictionary object.
- Do not make one property access site read the same field across unrelated logical layouts.
- Choose `null` vs `undefined` deliberately and keep it stable.

Checklist for each hot object:
- Which fields are read most often?
- Do those fields live on one stable shape?
- Are different node roles mixed through the same property access site?

## P0: Property Access Must Stay Predictable
For every hot access site such as:
- `node.state`
- `node.payload`
- `node.compute`
- `edge.prevIn`
- `edge.nextIn`
- `node.firstOut`

Answer explicitly:
- How many real shapes arrive here?
- Is the site monomorphic?
- If polymorphic, how many variants?
- Is that an intentional tradeoff or accidental architecture debt?

Red flag:
- One function reads `node.payload` or `node.compute` across producer/computed/watcher/debug roles as if they were one type.

## P0: Call-Sites Must Be Stable
- Verify every hot call-site: property load or function call.
- Do not mix plain reads and arbitrary function invocation semantics at one hot site.
- `node.compute()` should not share one call-site across unrelated semantics without a measured reason.
- Do not let one hot call-site serve:
  - cheap compute
  - expensive compute
  - side-effecting compute
  - different return profiles
- If semantics differ, prefer separate entry points.

Red flag:
- "Types are the same" is used to justify mixed runtime behavior.

## P0: Branches Are Judged By Frequency
For every `if` inside a hot function:
- Is this the common case?
- Is it cheap?
- Is the distribution stable?
- Does it drag in traversal, calls, or rare modes?
- Can it be precomputed earlier?
- Can it become one guard with the rest moved to a slow path?

Target shape:
- one or two cheap guards
- then linear work

Avoid:
- a seven-branch state machine inside every traversal iteration

## P0: Deopt Surface Must Be Deliberate
- No unexpected exceptions in hot code.
- No `try/catch` in hot functions without a hard reason.
- No proxies, reflective tricks, or prototype mutation in critical paths.
- No "sometimes number, sometimes object, sometimes symbol" at one critical site unless the cost is measured and accepted.
- Return profiles of hot functions should stay stable in type and semantics.

Red flag:
- "Sometimes returns boolean, sometimes node, sometimes 0 sentinel."

## P0: Mean Is Not Enough
Every perf run should preserve:
- mean
- p75
- p95
- p99
- p99.5 or p99.9 when relevant
- variance or RME

Victory is not only throughput:
- prefer wins that also improve tail latency
- if mean improves but p99 degrades, treat the change as suspicious
- rare slow branches should be measured with injected rare-case workloads

Red flag:
- "Average got better" without distribution data.

## P1: Hot Data vs Cold Data
- Move debug metadata out of the hot node shape.
- Dev-only bookkeeping must not live next to critical traversal fields.
- Rare structural flags should not pollute the fast path.
- If a field is rarely needed, it should not interfere with the common case.
- Hot/cold split must be justified by profile data, not taste.

Useful question:
- Which five fields are needed in 90% of passes?

## P1: State Representation Must Help The Fast Path
- Bitmasks are not automatically good.
- Avoid turning state into a miniature VM.
- Prefer a fast-state mask for the common case.
- Rare states must not force cascades of checks in every iteration.
- Group flags by read frequency, not only by conceptual neatness.
- Know which flags are read on every hot iteration.

Red flag:
- One `state` packs lifecycle, tracking, dispose, scheduling, structural mode, and debug mode with no fast/common split.

## P1: Universal Helpers Must Pass A Perf Interrogation
For every universal function:
- Why is this one path instead of several specialized ones?
- How many logical roles does it mix?
- How many shapes and execution paths does it serve?
- Is it definitely better than splitting by role or phase?

Suspicious example:
- one function handles invalidate, recompute, effect delivery, and structural fallback in one body

## P1: Traversal Must Have A Measured Cost
For every traversal:
- What is the average length?
- What is the worst-case length?
- How often does it happen?
- Is it an invariant or just a consequence of the current representation?
- Can pointer hops be reduced?
- Can checks per hop be reduced?

Inspect especially:
- backward scan to `depsTail`
- reuse search
- reposition edge
- reorder fallback

## P1: Reorder Policy Must Be Measured, Not Believed
- Compare `reorder_always`, `find_only`, and `no_reorder` separately.
- Choose policy by graph class, not author taste.
- Measure at least:
  - static
  - mildly dynamic
  - rotate/churn
  - pathological reorder-heavy
- If reorder does not pay for hot workloads, keep it out of the fast path.

## P2: Testing Discipline
Performance tests should include:
- monomorphic benchmark
- polymorphic benchmark
- rare slow-path injection benchmark
- shape churn benchmark
- branch-heavy benchmark
- real-world mixed topology benchmark

Correctness tests should:
- assert semantic contracts, not a specific algorithm
- assert topology invariants
- avoid blocking fast/slow strategy changes

## P2: Perf Diary Without Self-Deception
For every change, record:
- what changed
- why it should help
- which mechanism it targets:
  - IC
  - deopt
  - branch reduction
  - traversal reduction
  - call-site stabilization
- what happened to mean
- what happened to p99
- what broke
- whether the code complexity is worth keeping

Stop conditions:
- stop when the win is inside noise
- do not sacrifice architecture for a micro-win without tail improvement
- do not make code merely look low-level; make it more predictable
- do not keep a complex optimization without a documented invariant

## Hard Questions For Every Hot Section
Shape:
- How many shapes really arrive here?

Access:
- Is this property access monomorphic?

Call:
- Is this call-site stable?

Branches:
- Is this branch frequent, or am I just afraid of a rare case?

State:
- Why is this checked here instead of earlier?

Data:
- Is this a hot field or cold junk parked next to hot data?

Tails:
- What does this do to p99?

## Forbidden Illusions
- "The types are the same, so the JIT is happy."
- "One universal path is simpler, so it must be faster."
- "Bitmask state is always cheaper."
- "Fewer functions is always better."
- "If mean improved, everything is fine."
- "Rare cases do not matter."
- "Shape instability is fine, the engine is smart."

## Practical Priority
P0:
- flamegraph / CPU profile
- fast path / slow path split
- shape stability
- monomorphic property access
- stable call-sites
- p99 / p999

P1:
- state redesign
- traversal / reorder policy
- hot/cold split
- specialization by role

P2:
- cleanup abstractions
- prettier API shape
- second-order memory polish

## Patch Style
- Keep patches small and isolated.
- State the hypothesis before changing hot code.
- State the tradeoff after the change.
- If a perf tweak introduces a non-obvious invariant, document it next to the code.
