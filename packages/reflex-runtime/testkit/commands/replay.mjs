import { existsSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../lib/args.mjs";
import { readCounterexample, saveCounterexample } from "../lib/corpus.mjs";
import { loadOracle } from "../lib/engine.mjs";
import {
  packageRelative,
  packageRoot,
  scratchCorpusDir,
} from "../lib/paths.mjs";
import {
  buildSide,
  describeSide,
  loadSide,
  recordedSideSpec,
} from "../lib/sides.mjs";

export const synopsis =
  "[<counterexample.json> | --family <id> --seed <n>] [options]";
export const description = [
  "Re-runs one program on two sides and shows where their traces part:",
  "the verdict under the policy, the invariant violations of each side and",
  "an aligned window of both traces around the first mismatch. A saved",
  "counterexample brings its own sides, level and policy; options override.",
].join("\n");

export const options = {
  family: { type: "string", describe: "program family of a generated program" },
  seed: { type: "number", describe: "seed of a generated program" },
  reference: {
    type: "string",
    describe: "reference side (default: the counterexample's, else baseline)",
  },
  candidate: {
    type: "string",
    describe: "candidate side (default: the counterexample's, else source)",
  },
  flavor: {
    type: "string",
    describe: "build flavor (default: the counterexample's, else oracle)",
  },
  level: {
    type: "string",
    describe:
      "strict | observable (default: the counterexample's, else strict)",
  },
  policy: {
    type: "string",
    describe:
      "verdict policy (default: the counterexample's, else by reference)",
  },
  context: {
    type: "number",
    default: 6,
    describe: "trace entries shown around the first mismatch",
  },
  full: { type: "boolean", describe: "print both traces in full" },
  program: { type: "boolean", describe: "print the program as JSON" },
  shrink: {
    type: "boolean",
    describe: "minimize under the policy and save the result",
  },
  "shrink-steps": {
    type: "number",
    default: 4000,
    describe: "candidate programs the minimizer may try",
  },
  save: {
    type: "string",
    placeholder: "dir",
    default: packageRelative(scratchCorpusDir),
    describe: "where --shrink saves",
  },
};

function aligned(a, b, from, to, mark) {
  const width = Math.min(
    70,
    Math.max(9, ...a.slice(from, to).map((entry) => entry.length)),
  );
  const lines = [
    `  ${"#".padStart(5)}  ${"reference".padEnd(width)}  candidate`,
  ];
  for (let i = from; i < to; i++) {
    const left = a[i] ?? "·";
    const right = b[i] ?? "·";
    const flag = left === right ? " " : i === mark ? "▶" : "≠";
    const clipped = left.length > width ? `${left.slice(0, width - 1)}…` : left;
    lines.push(
      `${flag} ${String(i).padStart(5)}  ${clipped.padEnd(width)}  ${right}`,
    );
  }
  return lines.join("\n");
}

export default async function replayCommand(values, positionals) {
  const { families, verdict, reduce, program: p } = await loadOracle();
  let entry;
  let original;
  if (positionals.length === 1) {
    // Paths are printed relative to the package; accept them from anywhere.
    const given = path.resolve(positionals[0]);
    entry = readCounterexample(
      existsSync(given) ? given : path.resolve(packageRoot, positionals[0]),
    );
    original = entry.program;
  } else if (
    positionals.length === 0 &&
    values.family !== undefined &&
    values.seed !== undefined
  ) {
    original = families.family(values.family).generate(values.seed);
  } else {
    throw new UsageError(
      "give one counterexample file, or --family and --seed",
    );
  }
  const referenceSpec =
    values.reference ??
    recordedSideSpec(entry?.origin?.reference) ??
    "baseline";
  const candidateSpec =
    values.candidate ??
    recordedSideSpec(entry?.origin?.candidate ?? entry?.origin?.mutant) ??
    "source";
  const recordedFlavor = entry?.origin?.reference?.flavor;
  const flavor =
    values.flavor ??
    (recordedFlavor === "prebuilt" ? "oracle" : recordedFlavor) ??
    "oracle";
  const level = values.level ?? entry?.level ?? "strict";
  const policy =
    values.policy ??
    entry?.policy ??
    (referenceSpec === "baseline" ? "baseline" : "representation");
  if (!verdict.VERDICT_POLICIES.includes(policy))
    throw new UsageError(`unknown policy "${policy}"`);
  if (level !== "strict" && level !== "observable")
    throw new UsageError(`unknown level "${level}" (strict | observable)`);

  const reference = await buildSide(referenceSpec, { flavor });
  const candidate = await buildSide(candidateSpec, { flavor });
  const ref = await loadSide(reference);
  const cand = await loadSide(candidate);

  const a = p.interpret(ref, original, level);
  const b = p.interpret(cand, original, level);
  const result = verdict.judge(ref, cand, original, level, policy);
  const invariants = (rt) =>
    p
      .interpret(rt, original, "strict", { invariants: true })
      .filter((e) => e.startsWith("invariant:"));

  console.log(
    `program ${entry?.id ?? `${values.family}-${values.seed}`}: size ${p.programSize(original)}, ` +
      `${original.ops.length} ops, ${original.spec.producers} producers, ` +
      `${original.spec.consumers.length} consumers, ${original.spec.watchers.length} watchers`,
  );
  console.log(
    `reference ${referenceSpec}  candidate ${candidateSpec}  flavor ${flavor}  level ${level}  policy ${policy}`,
  );
  if (entry?.origin) console.log(`origin: ${JSON.stringify(entry.origin)}`);
  console.log(
    `verdict: ${result.kind}${result.kind === "accepted" ? ` (${result.class})` : ""}` +
      `  trace lengths ${a.length} / ${b.length}` +
      `  difference class: ${p.classifyTraceDifference(a, b)}`,
  );
  for (const [name, rt] of [
    ["reference", ref],
    ["candidate", cand],
  ]) {
    const found = invariants(rt);
    console.log(
      `invariant violations (${name}): ${found.length === 0 ? "none" : ""}`,
    );
    for (const line of found.slice(0, 8)) console.log(`  ${line}`);
    if (found.length > 8) console.log(`  … ${found.length - 8} more`);
  }
  const mismatch = p.firstMismatch(a, b);
  if (values.full)
    console.log(
      `\n${aligned(a, b, 0, Math.max(a.length, b.length), mismatch?.index)}`,
    );
  else if (mismatch !== null) {
    const from = Math.max(0, mismatch.index - values.context);
    const to = Math.min(
      Math.max(a.length, b.length),
      mismatch.index + values.context + 1,
    );
    console.log(
      `\nfirst mismatch at trace[${mismatch.index}]:\n${aligned(a, b, from, to, mismatch.index)}`,
    );
  }
  if (values.program) console.log(`\n${JSON.stringify(original)}`);

  if (values.shrink) {
    const rejects = verdict.rejects(ref, cand, level, policy);
    if (!rejects(original)) {
      console.log(
        "\nnothing to shrink: the program is not rejected under this policy",
      );
    } else {
      const minimal = reduce.minimize(
        original,
        rejects,
        values["shrink-steps"],
      );
      const file = saveCounterexample(path.resolve(packageRoot, values.save), {
        id: `${entry?.id ?? `${values.family}-${values.seed}-${level}`}-min`,
        expect: "agree",
        level,
        policy,
        origin: {
          command: "replay",
          ...(entry?.origin ?? { family: values.family, seed: values.seed }),
          reference: describeSide(reference),
          candidate: describeSide(candidate),
          foundAt: new Date().toISOString(),
        },
        size: {
          original: p.programSize(original),
          minimized: p.programSize(minimal),
        },
        mismatch: p.firstMismatch(
          p.interpret(ref, minimal, level),
          p.interpret(cand, minimal, level),
        ),
        program: minimal,
      });
      console.log(
        `\nshrunk ${p.programSize(original)} → ${p.programSize(minimal)}: ${packageRelative(file)}`,
      );
    }
  }
  return result.kind === "divergent" ? 1 : 0;
}
