# Tracking tier factorial benchmark

`pnpm bench:tracking-factorial` builds all eight production-mode combinations
of one-hop, two-hop, and last-edge tracking tiers. It measures left rotation,
right rotation, displacement by two, conditional branches, and mixed app-like
churn.

Each run cyclically changes and reverses variant order. The report stores raw
samples, every variant's median relative to the full baseline, and paired
marginal contrasts. Marginal values use `disabled / enabled - 1`, so a positive
number means enabling that tier improves latency.

The report also contains all classical main and interaction effects on log
latency. These are computed as positive-contrast mean minus negative-contrast
mean within each run and then bootstrapped by run. A negative factorial effect
means that enabling the factor or interaction reduces latency beyond lower-order
terms.

This is an experimental harness. Normal runtime builds compile all three tiers
on and expose no runtime feature switch.

## Latest 60-run result

The run was not CPU-isolated, so small latency effects remain provisional.

| Scenario             | One-hop main effect | Two-hop main effect | Last-edge main effect |
| -------------------- | ------------------: | ------------------: | --------------------: |
| Left rotate          |             -44.19% |              -0.40% |                +1.85% |
| Right rotate         |              +1.99% |              +0.28% |                +1.72% |
| Displacement by two  |              +0.64% |             -38.09% |                +0.91% |
| Conditional branches |              -0.40% |              +1.55% |                +2.57% |
| Mixed app churn      |              +0.17% |              +1.15% |                -3.00% |

Negative values mean that enabling the tier reduced latency. One-hop and
two-hop dominate their targeted synthetic displacement patterns. Last-edge is
harmful on right rotation and conditional branches, but retains a measurable
3% benefit on mixed churn.

Interactions are small relative to the targeted main effects. The largest
repeatable terms were one-hop × last-edge on left rotation (+2.19%), two-hop ×
last-edge on displacement-two (+1.93%), and one-hop × two-hop on mixed churn
(+1.24%). This gives no evidence that the large one-hop/two-hop benefits require
another tier to be enabled.

## Route substitution

`route-substitution.json` profiles last-edge on/off without contaminating the
timing bundles. Disabling last-edge produced exact one-for-one substitution:

- right rotate: 5,120 last-edge hits became 5,120 outgoing-probe hits;
- mixed app churn: 37,120 last-edge hits became 37,120 outgoing-probe hits;
- there were zero outgoing-probe misses in both cases.

The producer-side probe therefore subsumes last-edge's graph lookup complexity,
but not all of its constant-factor latency: delegation is slower on mixed churn.
This makes last-edge a specialization candidate rather than an unconditionally
dominated optimization.
