# Cost-attribution probes

The headline suite answers **where** a cost profile differs. These probes answer
**which mechanism** is responsible. They must run in a separate Reflex profile
build and never replace the production-package headline numbers.

## 1. Same write versus equal result

Do not use `equal-leaf` as evidence about recomputation. It writes the same
producer value and therefore measures producer equality plus the public
transaction/settle boundary; its expected `computed/op` is zero.

Use the three topology-matched probes instead:

- `equal-leaf`: same producer value, no recomputation or observer execution;
- `equal-write-direct`: the same subscribed equal write without the public
  transaction/settle boundary;
- `equal-result`: changed producer, one recomputation with an equal result,
  no observer execution;
- `changed-result`: changed producer, changed computed result, one observer
  execution.

Record per operation:

- compute entry and exit;
- equality comparisons and equal-result commits;
- tracking scopes entered, links reused, created, and unlinked;
- downstream invalidations and observer executions.

The delta between `equal-leaf` and `equal-write-direct` attributes the public
transaction/settle boundary instead of blaming producer equality for the
combined result. For `equal-result`, the expected result is one source write and one
recomputation, with no observer execution after equality. Subtracting the
same-write path isolates invalidation plus recomputation/tracking; subtracting
equal-result from changed-result isolates changed-result delivery and watcher
execution. The separate `semantic-noop-fanout` scenario scales the equal-result
mechanism over 1 / 16 / 256 / 1024 derived leaves.

## 2. Diamond fan-in: duplicate causal work

Use a shared source, `N` branches, and one observed sink. For each write record:

- unique producer nodes visited versus total edge visits;
- push marks, pull edge visits, `advance` calls, and short-circuits;
- each shared node's compute count;
- Changed → stable and Unknown → stable transitions;
- first/last-edge and repeated-parent paths separately.

The central ratio is `total edge visits / unique causal nodes`. A large gap
isolates duplicate evidence traversal rather than generic compute cost.

## 3. Dynamic branch/window: topology maintenance

Use `dynamic-branch` and `window-dependency-churn`, reporting:

- tracked reads;
- links created, reused, moved, and unlinked;
- cleanup scans and unvisited-edge removals;
- tail-cursor hits/misses and lookup fallback scans;
- allocations or freelist reuse associated with edge lifecycle.

Separate a one-branch switch from a whole-window rotation. They are both
"dynamic topology" but exercise different maintenance paths.

## 4. Effect fan-out: push and scheduler delivery

Use one shared derived node observed by 1 / 16 / 256 / 1024 effects. Record:

- outgoing-edge visits and watcher invalidations;
- queue enqueue/dequeue/dedup counts;
- observer executions and skipped disposed observers;
- maximum queue depth and allocations on the scheduler path.

Compare this with a pull-only reader of the same derived node to separate
propagation/scheduling cost from the derived computation itself.

## Interpretation rule

Do not infer a mechanism from throughput alone. A Reflex-vs-Alien difference is
actionable only after the two runs have equal observable output and the probe
shows whether Reflex performs more necessary semantic work, more mechanical
work for the same semantics, or a different public semantic contract.
