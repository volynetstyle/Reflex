import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");
const latest = JSON.parse(
  fs.readFileSync(path.join(dir, "results.json"), "utf8"),
);
const firstFile = path.join(dir, "results-first.json");
const first = fs.existsSync(firstFile)
  ? JSON.parse(fs.readFileSync(firstFile, "utf8"))
  : latest;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(3)),
  pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const lines = [
  "# Bounded-lookahead rotation results",
  "",
  `${latest.metadata.node}; ${latest.metadata.cpu}; ${latest.metadata.platform}. Both variants include preserve. Negative mean ns/op delta is faster. This compares the bounded helper policies, not the original eager baseline.`,
  "",
  "## Cost vector per operation",
  "",
  "| Workload | D | R | S move -> rotate | A | L | U | M move -> rotate | B move -> rotate | W move -> rotate | Delta | SearchAmp move -> rotate | MutationAmp move -> rotate |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
];
const csv = [];
for (const row of latest.rows) {
  const b = row.move.structural,
    a = row.rotate.structural,
    bc = b.perOperation,
    ac = a.perOperation;
  const previous = first.rows.find(
    (r) => r.workload === row.workload && r.D === row.D,
  );
  assert.deepEqual(b, previous.move.structural);
  assert.deepEqual(a, previous.rotate.structural);
  for (const k of ["R", "A", "L", "U"]) assert.equal(bc[k], ac[k]);
  assert.equal(b.Delta, a.Delta);
  const pair = (k) => `${fmt(bc[k])} -> ${fmt(ac[k])}`;
  const search = (c) => c.S / (1 + a.Delta),
    mutation = (c) => (c.L + c.U + c.M) / (1 + a.Delta);
  lines.push(
    `| ${row.workload} | ${row.D} | ${fmt(bc.R)} | ${pair("S")} | ${fmt(bc.A)} | ${fmt(bc.L)} | ${fmt(bc.U)} | ${pair("M")} | ${pair("B")} | ${pair("W")} | ${fmt(a.Delta)} | ${fmt(search(bc))} -> ${fmt(search(ac))} | ${fmt(mutation(bc))} -> ${fmt(mutation(ac))} |`,
  );
  for (const variant of ["move", "rotate"]) {
    const s = row[variant].structural,
      c = s.perOperation,
      t = row[variant].timing;
    csv.push({
      workload: row.workload,
      D: row.D,
      variant,
      ...c,
      Delta: s.Delta,
      SearchAmp: search(c),
      MutationAmp: mutation(c),
      stableEligible: s.stableEligible,
      stableRetained: s.stableRetained,
      meanNs: t.mean,
      medianNs: t.median,
      p75Ns: t.p75,
      p95Ns: t.p95,
      p99BatchNs: t.p99,
      variance: t.variance,
      rme95Percent: t.rme95Percent,
      opsPerSecond: t.opsPerSecond,
      wallTimeMs: t.wallTimeMs,
      batchIterations: t.batchIterations,
    });
  }
}
lines.push(
  "",
  "## Wall time, two independent full runs",
  "",
  "| Workload | D | Move ns/op (run 2) | Rotate ns/op (run 2) | Delta run 1 | Delta run 2 | RME move / rotate | Batch p99 move / rotate |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const row of latest.rows) {
  const previous = first.rows.find(
      (r) => r.workload === row.workload && r.D === row.D,
    ),
    b = row.move.timing,
    a = row.rotate.timing;
  lines.push(
    `| ${row.workload} | ${row.D} | ${fmt(b.mean)} | ${fmt(a.mean)} | ${pct((previous.timeRatio - 1) * 100)} | ${pct((row.timeRatio - 1) * 100)} | ${fmt(b.rme95Percent)}% / ${fmt(a.rme95Percent)}% | ${fmt(b.p99)} / ${fmt(a.p99)} |`,
  );
}
lines.push(
  "",
  "## Skipped-block reuse diagnostics (16 structural operations)",
  "",
  "Candidate distances and lengths are from the independently checked replay. Rank is not actual probe count. Reuse distance concerns any skipped edge within the current attempt; throw-censored rotations are not classified as permanently unused.",
  "",
  "| Workload | D | Rotations | Mean candidate rank (rotations) | Next read = skipped head | Reuse distance min / mean / max | No reuse by success | Censored at throw |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const row of latest.rows) {
  const d = row.rotate.structural.diagnostics,
    r = d.readsUntilSkippedBlockReuse;
  if (!d.blockRotations) continue;
  lines.push(
    `| ${row.workload} | ${row.D} | ${d.blockRotations} | ${fmt(d.rotationCandidateSearchDistance.mean)} | ${d.nextReadWasSkippedBlockHead} | ${r.count ? `${fmt(r.min)} / ${fmt(r.mean)} / ${fmt(r.max)}` : "none observed"} | ${d.notReusedBySuccessfulPassEnd} | ${d.notReusedBeforeThrow} |`,
  );
}
lines.push(
  "",
  "## Findings",
  "",
  "FACT: all structural counts and replay diagnostics match exactly between runs. Every measured A/L/U/M/B/W vector also matches the offline replay and the actual final incoming order. R/A/L/U are unchanged between policies in this matrix; only search/reorder work differs.",
  "",
  "FACT: alternating D=64 changes S 137->11, M 64->0, B 0->1, W 469->91; A=L=U=1 and R=66. The 16 skipped blocks are never reused by successful pass end. W remains linear in R because tailIn is written on normal sequential reads.",
  "",
  "FACT: local-swap D>=16 changes S 2->9, M 1->1, B 0->1 and W increases by 6. The next callback read requests the skipped head after every rotation. The candidate is now the physical tail and the unchanged last-edge shortcut moves it back. This is one rotation plus one individual move, not two bounded rotations.",
  "",
  "FACT: complete replacement and cyclic-right-one have identical structural vectors; the rotation site is not exercised there. Random reorder can increase or decrease actual search and write counts slightly; it is not universally helped. Front insertion preserves all stable identities; the averaged benefit comes from the reverse removal transition.",
  "",
  "FACT: failure/retry cases retain correct prefix/topology and retry without rollback. The timing unit includes a failed attempt and retry when D>=2; these times are not directly comparable to successful-only workloads. Reuse diagnostics for rotations before throw are censored.",
  "",
  "INFERENCE: small-gap rotation removes repeated moves on long retained runs. It does not dominate local swaps and does not repair preserve's large replacement tradeoff. This experiment supplies no production selection heuristic or optimal K.",
  "",
  "See oracle.md for an exact bounded **W** oracle. It deliberately does not predict wall time or mix event weights. Existing aggregate amplification is superseded by the cost vector and separate ratios for this experiment.",
  "",
);
fs.writeFileSync(path.join(dir, "summary.md"), lines.join("\n"));
const columns = Object.keys(csv[0]);
fs.writeFileSync(
  path.join(dir, "results.csv"),
  [
    columns.join(","),
    ...csv.map((r) => columns.map((k) => r[k]).join(",")),
  ].join("\n") + "\n",
);
console.log(
  `Validated ${latest.rows.length} paired structural rows; wrote ${csv.length} CSV records.`,
);
