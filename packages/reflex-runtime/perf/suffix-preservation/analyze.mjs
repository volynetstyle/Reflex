import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");
const latest = JSON.parse(
  fs.readFileSync(path.join(dir, "results.json"), "utf8"),
);
const firstPath = path.join(dir, "results-first.json");
const first = fs.existsSync(firstPath)
  ? JSON.parse(fs.readFileSync(firstPath, "utf8"))
  : latest;
const format = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(3));
const percent = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const lines = [
  "# Measured suffix-preservation results",
  "",
  `Baseline: ${latest.metadata.baselineCommit}. ${latest.metadata.node}; ${latest.metadata.cpu}; ${latest.metadata.platform}.`,
  "",
  "All counts are per completed write/read transition, excluding setup. Timing deltas compare mean ns/op: negative is faster. The complete raw samples and variance/RME are in results.json and results-first.json. See ../README.md for metric definitions and limitations.",
  "",
  "## Mean wall time, two full runs",
  "",
  "| Workload | D | Before ns/op (run 2) | After ns/op (run 2) | Delta run 1 | Delta run 2 | Before RME | After RME | Before/after batch p99 ns/op |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
];
const records = [];
for (const row of latest.rows) {
  const previous = first.rows.find(
    (r) => r.workload === row.workload && r.D === row.D,
  );
  const b = row.before.timing,
    a = row.after.timing;
  lines.push(
    `| ${row.workload} | ${row.D} | ${format(b.mean)} | ${format(a.mean)} | ${percent((previous.timeRatio - 1) * 100)} | ${percent((row.timeRatio - 1) * 100)} | ${b.rme95Percent.toFixed(1)}% | ${a.rme95Percent.toFixed(1)}% | ${format(b.p99)} / ${format(a.p99)} |`,
  );
  for (const variant of ["before", "after"])
    records.push({
      workload: row.workload,
      D: row.D,
      variant,
      ...row[variant].structural,
      totalAmplification:
        (row[variant].structural.linksTraversed +
          row[variant].structural.physicalMutations) /
        (1 + row[variant].structural.dependencyDelta),
      mutationAmplification:
        row[variant].structural.physicalMutations /
        (1 + row[variant].structural.dependencyDelta),
      ...Object.fromEntries(
        Object.entries(row[variant].timing).filter(
          ([k]) => !["samples", "unit"].includes(k),
        ),
      ),
    });
}
lines.push(
  "",
  "## Structural counts (before -> after)",
  "",
  "| Workload | D | Link reads | Allocations | Links | Unlinks | Moves | Stable retained / eligible | Callback reads | Set delta | Physical mutations |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const row of latest.rows) {
  const b = row.before.structural,
    a = row.after.structural;
  const pair = (k) => `${format(b[k])} -> ${format(a[k])}`;
  const prior = first.rows.find(
    (r) => r.workload === row.workload && r.D === row.D,
  );
  if (
    JSON.stringify(prior.before.structural) !== JSON.stringify(b) ||
    JSON.stringify(prior.after.structural) !== JSON.stringify(a)
  )
    throw new Error("Non-reproducible structural counters");
  lines.push(
    `| ${row.workload} | ${row.D} | ${pair("linksTraversed")} | ${pair("edgeAllocations")} | ${pair("edgeLinks")} | ${pair("edgeUnlinks")} | ${pair("edgeMoves")} | ${pair("stableEdgesRetained")} / ${format(a.stableEdgesEligible)} | ${pair("callbackDependencyReads")} | ${pair("dependencyDelta")} | ${pair("physicalMutations")} |`,
  );
}
lines.push(
  "",
  "## Interpretation",
  "",
  "FACT: structural measurements agree exactly between the independent runs. For alternating D=64, allocations 65->1, unlinks 65->1, moves 0->64, stable retained 1->65 including tick, physical mutations 130->66, semantic delta 2->2. Link reads increase 295->329. The win is allocation/unlink avoidance, not a universal reduction in pointer reads.",
  "",
  "FACT: alternating D>=31 is substantially faster in both runs. Stable and reorder controls have identical structural work. Small timing differences in these controls are not evidence of eliminated work.",
  "",
  "FACT: replacement D=4096 keeps 4096 allocations, 4096 unlinks and zero moves in both versions, but link reads increase 16419->28674; it is slower in both runs. At D=31 replacement instead avoids repeated sub-threshold suffix scans: link reads 1180->219.",
  "",
  "INFERENCE: preserving an obsolete suffix routes later complete-replacement reads through insertion/reconciliation with a nonempty suffix, instead of the baseline's completed-prefix append path. It also keeps old and new edges alive until final cleanup. These explain plausible sources of the measured regression; their individual time contributions have not been isolated.",
  "",
  "Decision: keep the patch as an isolated measured candidate, not an unconditional release recommendation. Eliminating the remaining moves or selecting another replacement policy would require a separate experiment. No such change is included.",
  "",
);
lines.push(
  "## Amplification (derived from existing samples; no new timing run)",
  "",
  "A_total = (linksTraversed + physicalMutations)/(1 + dependencyDelta). A_mutation = physicalMutations/(1 + dependencyDelta). Existing linksTraversed includes sequential tracking and structural bookkeeping; A_total is not search-only overhead or a time predictor. See the semantic baseline addendum for the future search/sequence partition and order-change limitation.",
  "",
  "| Workload | D | A_total before | A_total after | A_mutation before | A_mutation after |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
);
for (const row of latest.rows) {
  const b = row.before.structural,
    a = row.after.structural;
  const total = (x) =>
    (x.linksTraversed + x.physicalMutations) / (1 + x.dependencyDelta);
  const mutation = (x) => x.physicalMutations / (1 + x.dependencyDelta);
  lines.push(
    `| ${row.workload} | ${row.D} | ${format(total(b))} | ${format(total(a))} | ${format(mutation(b))} | ${format(mutation(a))} |`,
  );
}
lines.push("");
fs.writeFileSync(path.join(dir, "summary.md"), lines.join("\n"));
const columns = Object.keys(records[0]);
fs.writeFileSync(
  path.join(dir, "results.csv"),
  [
    columns.join(","),
    ...records.map((r) => columns.map((k) => r[k]).join(",")),
  ].join("\n") + "\n",
);
console.log(
  `Wrote ${latest.rows.length} comparison rows and ${records.length} CSV records.`,
);
