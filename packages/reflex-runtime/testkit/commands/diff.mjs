import path from "node:path";

import { UsageError } from "../lib/args.mjs";
import { saveCounterexample } from "../lib/corpus.mjs";
import { loadOracle, runSharded } from "../lib/engine.mjs";
import {
  packageRelative,
  packageRoot,
  scratchCorpusDir,
} from "../lib/paths.mjs";
import {
  formatMs,
  printReportPath,
  table,
  writeReport,
} from "../lib/report.mjs";
import { buildSide, describeSide, loadSide } from "../lib/sides.mjs";

export const synopsis = "[options]";
export const description = [
  "Runs generated programs on two runtime builds and judges every pair of",
  "traces under a verdict policy (pnpm rt list policies). Divergent programs",
  "are minimized and saved as counterexamples for `pnpm rt replay`.",
  "",
  "Sides: source | baseline | <git ref> | bundle:<file>, each optionally",
  "+<variant> (perf/tracking-ladder/variants.mjs) or +mutant:<id>.",
  "",
  "  pnpm rt diff                                   baseline vs working tree, as the vitest oracle",
  "  pnpm rt diff --reference HEAD --policy representation --flavor production",
  "  pnpm rt diff --reference HEAD --candidate HEAD+eager-detach --policy representation",
  "  pnpm rt diff --families swarm --time 10m --jobs 6 --max-failures 0",
].join("\n");

export const options = {
  reference: {
    type: "string",
    default: "baseline",
    describe: "reference side",
  },
  candidate: { type: "string", default: "source", describe: "candidate side" },
  flavor: {
    type: "string",
    default: "oracle",
    describe: "build flavor of both sides (pnpm rt list flavors)",
  },
  policy: {
    type: "string",
    describe:
      "exact | representation | baseline (default: baseline when the reference is the baseline, else representation)",
  },
  families: {
    type: "list",
    default: ["default", "hub"],
    describe: "program families (pnpm rt list families)",
  },
  programs: {
    type: "number",
    min: 1,
    default: 2000,
    describe: "programs per family; with --time, an upper bound",
  },
  seed: {
    type: "number",
    min: 1,
    default: 1,
    describe: "first seed of every family",
  },
  time: {
    type: "duration",
    describe:
      "stop after this long (90s, 10m, 1h); without --programs, unbounded",
  },
  levels: {
    type: "list",
    default: ["strict", "observable"],
    describe: "observation levels",
  },
  jobs: {
    type: "number",
    min: 1,
    default: 1,
    describe: "worker threads (seeds are interleaved across them)",
  },
  "max-failures": {
    type: "number",
    default: 1,
    describe: "stop after this many divergent programs (0: never)",
  },
  show: {
    type: "number",
    default: 3,
    describe: "minimize, print and save this many failures",
  },
  save: {
    type: "string",
    placeholder: "dir",
    default: packageRelative(scratchCorpusDir),
    describe: "where counterexamples go",
  },
  "shrink-steps": {
    type: "number",
    default: 4000,
    describe: "candidate programs the minimizer may try",
  },
  report: {
    type: "string",
    placeholder: "file",
    describe: "write the run record here",
  },
};

export default async function diffCommand(values, positionals) {
  if (positionals.length > 0)
    throw new UsageError(`unexpected argument ${positionals[0]}`);
  const policy =
    values.policy ??
    (values.reference === "baseline" ? "baseline" : "representation");
  const { families, verdict, reduce, program: p } = await loadOracle();
  if (!verdict.VERDICT_POLICIES.includes(policy))
    throw new UsageError(
      `unknown policy "${policy}" (known: ${verdict.VERDICT_POLICIES.join(", ")})`,
    );
  for (const id of values.families) {
    if (!(id in families.families))
      throw new UsageError(
        `unknown family "${id}" (known: ${Object.keys(families.families).join(", ")})`,
      );
  }
  for (const level of values.levels) {
    if (level !== "strict" && level !== "observable")
      throw new UsageError(`unknown level "${level}" (strict | observable)`);
  }
  const programsGiven =
    process.argv.includes("--programs") ||
    process.argv.some((arg) => arg.startsWith("--programs="));
  const count =
    values.time !== undefined && !programsGiven
      ? Number.MAX_SAFE_INTEGER
      : values.programs;

  const reference = await buildSide(values.reference, {
    flavor: values.flavor,
  });
  const candidate = await buildSide(values.candidate, {
    flavor: values.flavor,
  });
  const referenceModule = await loadSide(reference);
  const candidateModule = await loadSide(candidate);

  console.log(
    `reference ${values.reference} (${reference.bundleSha256.slice(0, 12)})  ` +
      `candidate ${values.candidate} (${candidate.bundleSha256.slice(0, 12)})  ` +
      `flavor ${values.flavor}  policy ${policy}`,
  );
  if (
    reference.bundleSha256 === candidate.bundleSha256 &&
    values.reference !== values.candidate
  )
    console.log(
      "note: both sides built to the same bytes; the comparison is an A/A control",
    );

  const began = performance.now();
  const outcome = await runSharded(
    { reference, candidate, referenceModule, candidateModule },
    {
      families: values.families.map((id) => ({
        id,
        first: values.seed,
        count,
      })),
      levels: values.levels,
      policy,
      deadline: values.time === undefined ? null : Date.now() + values.time,
      maxFailures: values["max-failures"],
    },
    Math.max(1, Math.floor(values.jobs)),
  );
  const elapsed = performance.now() - began;

  const rows = Object.entries(outcome.rows).map(([key, row]) => ({
    "family/level": key,
    programs: row.programs,
    identical: row.identical,
    accepted:
      Object.entries(row.accepted)
        .map(([name, n]) => `${name}:${n}`)
        .join(" ") || "0",
    inconclusive: row.inconclusive,
    divergent: row.divergent,
    crashed: row.crashed,
  }));
  console.log(`\n${table(rows)}`);
  const total = rows.reduce((sum, row) => sum + row.programs, 0);
  console.log(
    `\n${total} program runs in ${formatMs(elapsed)}` +
      (outcome.timedOut ? " (time budget reached)" : "") +
      (outcome.failures.length > 0 &&
      values["max-failures"] > 0 &&
      outcome.failures.length >= values["max-failures"]
        ? " (stopped at --max-failures)"
        : ""),
  );

  if (outcome.inconclusive.length > 0)
    console.log(
      `inconclusive (both sides exhaust the stack): ${outcome.inconclusive
        .map((item) => `${item.family}-${item.seed}-${item.level}`)
        .join(" ")}`,
    );

  const saved = [];
  for (const failure of outcome.failures.slice(0, values.show)) {
    const original = families.family(failure.family).generate(failure.seed);
    const id = `${failure.family}-${failure.seed}-${failure.level}`;
    if (failure.kind === "crash") {
      console.log(`\n✗ ${id}: harness crash: ${failure.error}`);
      continue;
    }
    const rejects = verdict.rejects(
      referenceModule,
      candidateModule,
      failure.level,
      policy,
    );
    // Confirm by re-running before minimizing: a verdict that does not repeat
    // is a flaky outcome, reported as such and never saved.
    if (!rejects(original)) {
      console.log(
        `\n? ${id}: divergent once, not on re-run (flaky); not saved`,
      );
      continue;
    }
    const minimal = reduce.minimize(original, rejects, values["shrink-steps"]);
    const mismatch = p.firstMismatch(
      p.interpret(referenceModule, minimal, failure.level),
      p.interpret(candidateModule, minimal, failure.level),
    );
    const file = saveCounterexample(path.resolve(packageRoot, values.save), {
      id,
      expect: "agree",
      level: failure.level,
      policy,
      origin: {
        command: "diff",
        family: failure.family,
        seed: failure.seed,
        reference: describeSide(reference),
        candidate: describeSide(candidate),
        foundAt: new Date().toISOString(),
      },
      size: {
        original: p.programSize(original),
        minimized: p.programSize(minimal),
      },
      mismatch,
      program: minimal,
    });
    saved.push(packageRelative(file));
    console.log(
      `\n✗ ${id}: size ${p.programSize(original)} → ${p.programSize(minimal)}\n` +
        `  first mismatch at trace[${mismatch?.index}]\n` +
        `    reference: ${mismatch?.baseline}\n` +
        `    candidate: ${mismatch?.candidate}\n` +
        `  replay: pnpm rt replay ${packageRelative(file)}`,
    );
  }

  const divergent = outcome.failures.length;
  printReportPath(
    writeReport(
      "diff",
      {
        status: divergent === 0 ? "passed" : "failed",
        reference: describeSide(reference),
        candidate: describeSide(candidate),
        policy,
        levels: values.levels,
        families: values.families,
        firstSeed: values.seed,
        programsPerFamily: count === Number.MAX_SAFE_INTEGER ? null : count,
        timeBudgetMs: values.time ?? null,
        jobs: values.jobs,
        durationMs: Math.round(elapsed),
        timedOut: outcome.timedOut,
        rows: outcome.rows,
        failures: outcome.failures,
        inconclusive: outcome.inconclusive,
        counterexamples: saved,
      },
      values.report,
    ),
  );
  return divergent === 0 ? 0 : 1;
}
