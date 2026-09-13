import assert from "node:assert/strict";
import fs from "node:fs";
// Exact offline dynamic program within an explicit abstract action set.
// W counts graph pointer writes, not time. No weighted sum of event kinds.
const zero = () => ({ A: 0, L: 0, U: 0, M: 0, B: 0, W: 0 });
const plus = (a, b) =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]));
function transitions(order, cursor, source, policy) {
  const index = order.indexOf(source),
    options = [];
  if (index < cursor && index >= 0)
    return [{ order, cursor, cost: zero(), action: "duplicate" }];
  if (index === cursor)
    return [
      { order, cursor: cursor + 1, cost: { ...zero(), W: 1 }, action: "next" },
    ];
  if (index < 0) {
    if (!policy || policy.startsWith("preserve")) {
      const next = order.slice();
      next.splice(cursor, 0, source);
      options.push({
        order: next,
        cursor: cursor + 1,
        cost: { ...zero(), A: 1, L: 1, W: 11 },
        action: "preserve+link",
      });
    }
    if (!policy || policy.startsWith("eager")) {
      const stale = order.length - cursor,
        next = order.slice(0, cursor);
      next.push(source);
      options.push({
        order: next,
        cursor: cursor + 1,
        cost: {
          ...zero(),
          A: 1,
          L: 1,
          U: stale,
          W: 11 + (stale ? 3 + 6 * stale : 0),
        },
        action: "detach+link",
      });
    }
    return options;
  }
  const gap = index - cursor,
    canRotate = cursor > 0 && gap <= 2;
  if (!policy || policy.endsWith("move") || !canRotate) {
    const next = order.slice();
    next.splice(index, 1);
    next.splice(cursor, 0, source);
    options.push({
      order: next,
      cursor: cursor + 1,
      cost: { ...zero(), M: 1, W: 7 },
      action: "move",
    });
  }
  if (canRotate && (!policy || policy.endsWith("rotate"))) {
    const next = order.slice(),
      skipped = next.splice(cursor, gap);
    next.push(...skipped);
    options.push({
      order: next,
      cursor: cursor + 1,
      cost: { ...zero(), B: 1, W: 7 },
      action: "rotate",
    });
  }
  return options;
}
function optimal(oldOrder, trace, objective, policy) {
  const memo = new Map();
  const better = (a, b) =>
    a.vector[objective] - b.vector[objective] ||
    a.vector[objective === "A" ? "W" : "A"] -
      b.vector[objective === "A" ? "W" : "A"];
  function solve(index, order, cursor) {
    const key = `${index}|${cursor}|${order.join(",")}`;
    if (memo.has(key)) return memo.get(key);
    if (index === trace.length) {
      const n = order.length - cursor;
      return { vector: { ...zero(), U: n, W: n ? 2 + 6 * n : 0 }, plan: [] };
    }
    const candidates = transitions(order, cursor, trace[index], policy).map(
      (step) => {
        const rest = solve(index + 1, step.order, step.cursor);
        return {
          vector: plus(step.cost, rest.vector),
          plan: [step.action, ...rest.plan],
        };
      },
    );
    candidates.sort(better);
    memo.set(key, candidates[0]);
    return candidates[0];
  }
  const result = solve(0, oldOrder, 0);
  result.vector.W++;
  return { ...result, states: memo.size };
}
function permutations(a) {
  return a.length
    ? a.flatMap((x, i) =>
        permutations(a.filter((_, j) => j !== i)).map((t) => [x, ...t]),
      )
    : [[]];
}
const cases = [];
for (let n = 1; n <= 5; n++) {
  const old = Array.from({ length: n }, (_, i) => i);
  for (const trace of permutations(old))
    cases.push({
      name: `permutation-${n}`,
      old: [-1, ...old],
      trace: [-1, ...trace],
    });
}
const base = [0, 1, 2, 3, 4, 5, 6, 7];
for (const [name, trace] of [
  ["alternating", [8, ...base.slice(1)]],
  ["insert-front", [8, ...base]],
  ["local-swap", [1, 0, ...base.slice(2)]],
  ["omit-first", base.slice(1)],
  ["cyclic-left1", [...base.slice(1), base[0]]],
  ["cyclic-left2", [...base.slice(2), ...base.slice(0, 2)]],
  ["cyclic-right1", [base.at(-1), ...base.slice(0, -1)]],
  ["replacement", base.map((x) => x + 8)],
  ["new-burst-then-reuse", [8, 9, 10, 11, ...base]],
])
  cases.push({ name, old: [-1, ...base], trace: [-1, ...trace] });
const policies = [
  "preserve-move",
  "preserve-rotate",
  "eager-move",
  "eager-rotate",
];
const rows = cases.map((c) => {
  const minW = optimal(c.old, c.trace, "W"),
    minA = optimal(c.old, c.trace, "A");
  const measured = Object.fromEntries(
    policies.map((policy) => {
      const result = optimal(c.old, c.trace, "W", policy);
      const regretW = result.vector.W - minW.vector.W,
        regretA = result.vector.A - minA.vector.A;
      assert(regretW >= 0 && regretA >= 0);
      return [policy, { ...result, regretW, regretA }];
    }),
  );
  return { ...c, oracleMinW: minW, oracleMinA: minA, policies: measured };
});
// Independent brute enumeration on small traces checks the memoized optimum.
function enumerate(order, trace, cursor = 0, index = 0) {
  if (index === trace.length) {
    const n = order.length - cursor;
    return [{ ...zero(), U: n, W: n ? 2 + 6 * n : 0 }];
  }
  return transitions(order, cursor, trace[index]).flatMap((step) =>
    enumerate(step.order, trace, step.cursor, index + 1).map((rest) =>
      plus(step.cost, rest),
    ),
  );
}
let checked = 0;
for (const c of cases.filter((c) => c.old.length <= 5)) {
  const all = enumerate(c.old, c.trace);
  assert.equal(
    optimal(c.old, c.trace, "W").vector.W,
    1 + Math.min(...all.map((x) => x.W)),
  );
  assert.equal(
    optimal(c.old, c.trace, "A").vector.A,
    Math.min(...all.map((x) => x.A)),
  );
  checked++;
}
const report = {
  model: {
    objective:
      "Separate minima of W (raw graph pointer writes) and A (allocations); no wall-time oracle",
    actions:
      "On new source: preserve+link or immediate suffix detach+link. On existing non-next source: move, or rotation only if skipped gap <=2 and cursor non-null. No prefetch or arbitrary permutation.",
    costs: {
      nextW: 1,
      duplicateW: 0,
      linkW: 11,
      moveW: 7,
      rotationW: 7,
      unlinkPerEdgeW: 6,
      finalCutW: 2,
      eagerCutW: 3,
      entryCursorResetW: 1,
    },
    limitations:
      "Fanout-one unique-source successful traces; eager means immediate detach, not historical threshold=32. Search cost S, branch work, GC and timing excluded. W-optimal need not be time-optimal. Counterfactual eager cost is modeled, not runtime measured. Separate A/W minima need not form a jointly achievable vector.",
  },
  bruteForceCrossChecked: checked,
  rows,
};
fs.writeFileSync(
  new URL("./results/oracle.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
const lines = [
  "# Offline oracle: explicit pointer-write objective",
  "",
  "This is an exact oracle within the action model in oracle.json, not a wall-time or general tracking optimum. A and W are minimized independently. Immediate eager detach is counterfactual, not the historical 32-edge policy. Preserving old edges can minimize W while still losing wall time on replacement: S and branch costs are absent from this objective.",
  "",
  `Cases: ${rows.length}; independent brute-force cross-checks: ${checked}.`,
  "",
  "| Trace | Oracle min W | Preserve/move W regret | Preserve/rotate W regret | Eager/move W regret | Eager/rotate W regret |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
];
for (const row of rows.filter((x) => !x.name.startsWith("permutation")))
  lines.push(
    `| ${row.name} | ${row.oracleMinW.vector.W} | ${policies.map((p) => row.policies[p].regretW).join(" | ")} |`,
  );
lines.push(
  "",
  "The local-swap and omit-first pair starts from the same old order and requests the same first mismatching source; only future reads differ. A gap-only policy cannot select the W-optimal action for both. A single action count is not used as a substitute for pointer writes.",
  "",
);
fs.writeFileSync(
  new URL("./results/oracle.md", import.meta.url),
  lines.join("\n"),
);
console.log(
  `Oracle: ${rows.length} traces, ${checked} brute-force cross-checks.`,
);
