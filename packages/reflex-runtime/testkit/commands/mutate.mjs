import path from "node:path";
import { pathToFileURL } from "node:url";

import { UsageError } from "../lib/args.mjs";
import {
  counterexampleFile,
  readCounterexample,
  saveCounterexample,
} from "../lib/corpus.mjs";
import { loadOracle } from "../lib/engine.mjs";
import {
  committedCorpusDir,
  packageRelative,
  packageRoot,
} from "../lib/paths.mjs";
import {
  formatMs,
  printReportPath,
  table,
  writeReport,
} from "../lib/report.mjs";
import { buildSide, describeSide, loadSide } from "../lib/sides.mjs";
import { existsSync } from "node:fs";

export const synopsis = "[options]";
export const description = [
  "Mutation analysis of the program oracle. Every mutant (testkit/oracle/mutants.ts,",
  "or ad-hoc with --mutate) is built from the reference side and searched for",
  "the first seed whose traces differ under the policy; a found program is",
  "minimized and is the mutant's witness. Prints the kill matrix and the",
  "mutation score, and fails when a mutant expected to be killed survives or a",
  "documented gap is killed.",
  "",
  "Against `source` (the default) a kill is the mutation's own effect; against",
  "`baseline` the baseline policy keeps known corrections from counting as kills.",
  "Witnesses in --witnesses are tried first, so a qualified oracle re-qualifies",
  "in one program per mutant.",
].join("\n");

export const options = {
  mutants: {
    type: "list",
    describe: "mutant ids (default: all of the catalog)",
  },
  mutate: {
    type: "string",
    repeat: true,
    placeholder: "file::search::replace",
    describe: "ad-hoc mutant (repeatable)",
  },
  against: {
    type: "string",
    default: "source",
    describe: "the side mutants are built from and compared to",
  },
  budget: {
    type: "number",
    min: 1,
    default: 2000,
    describe: "seeds per mutant",
  },
  level: { type: "string", default: "strict", describe: "observation level" },
  witnesses: {
    type: "string",
    placeholder: "dir",
    default: packageRelative(committedCorpusDir),
    describe: "witness corpus: read first, written with --record",
  },
  record: {
    type: "boolean",
    describe: "write every new minimized witness into --witnesses",
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

export default async function mutateCommand(values, positionals) {
  if (positionals.length > 0)
    throw new UsageError(`unexpected argument ${positionals[0]}`);
  const { families, verdict, reduce, program: p } = await loadOracle();
  if (values.level !== "strict" && values.level !== "observable")
    throw new UsageError(
      `unknown level "${values.level}" (strict | observable)`,
    );
  const { MUTANTS, mutationArgument } = await import(
    pathToFileURL(path.join(packageRoot, "testkit/oracle/mutants.ts")).href
  );
  const policy = values.against === "baseline" ? "baseline" : "exact";
  let selected = MUTANTS;
  if (values.mutants !== undefined) {
    selected = values.mutants.map((id) => {
      const found = MUTANTS.find((m) => m.id === id);
      if (found === undefined)
        throw new UsageError(`unknown mutant "${id}" (pnpm rt list mutants)`);
      return found;
    });
  }
  const adHoc = values.mutate.map((spec, index) => {
    const [file, search, replace] = spec.split("::");
    if (!file || search === undefined || replace === undefined)
      throw new UsageError(
        `--mutate expects file::search::replace, got "${spec}"`,
      );
    return {
      id: `ad-hoc-${index + 1}`,
      file,
      search,
      replace,
      expected: "killed",
      adHoc: true,
    };
  });
  if (values.mutate.length > 0 && values.mutants === undefined) selected = [];
  const mutants = [...selected, ...adHoc];
  if (mutants.length === 0) throw new UsageError("no mutants selected");

  const reference = await buildSide(values.against, { flavor: "oracle" });
  const ref = await loadSide(reference);
  const witnessDir = path.resolve(packageRoot, values.witnesses);
  const rows = [];
  const records = [];
  let unexpected = 0;

  for (const mutant of mutants) {
    const began = performance.now();
    let side;
    try {
      side = await buildSide(values.against, {
        flavor: "oracle",
        extraMutations: [mutationArgument(mutant)],
        quiet: true,
      });
    } catch (error) {
      rows.push({
        mutant: mutant.id,
        expected: mutant.expected,
        result: "unbuildable",
        seed: "",
        witness: "",
        time: "",
      });
      records.push({
        id: mutant.id,
        result: "unbuildable",
        error: error.message,
      });
      unexpected++;
      continue;
    }
    const rt = await loadSide(side);
    const rejects = verdict.rejects(ref, rt, values.level, policy);
    const familyId = mutant.generator ?? "default";
    const generate = families.family(familyId).generate;

    let killer;
    let killedBy;
    const witnessFile = counterexampleFile(witnessDir, `mutant-${mutant.id}`);
    if (!mutant.adHoc && existsSync(witnessFile)) {
      const witness = readCounterexample(witnessFile);
      if (rejects(witness.program)) {
        killer = witness.program;
        killedBy = "witness";
      }
    }
    if (killer === undefined) {
      for (let seed = 1; seed <= values.budget; seed++) {
        const candidate = generate(seed);
        if (rejects(candidate)) {
          killer = candidate;
          killedBy = seed;
          break;
        }
      }
    }
    const killed = killer !== undefined;
    const minimal =
      killed && killedBy !== "witness"
        ? reduce.minimize(killer, rejects, values["shrink-steps"])
        : killer;
    const ok = killed === (mutant.expected === "killed");
    if (!ok) unexpected++;
    if (killed && killedBy !== "witness" && values.record && !mutant.adHoc) {
      saveCounterexample(witnessDir, {
        id: `mutant-${mutant.id}`,
        expect: "agree",
        level: values.level,
        policy,
        origin: {
          command: "mutate",
          mutantId: mutant.id,
          family: familyId,
          seed: killedBy,
          reference: describeSide(reference),
          mutant: {
            ...describeSide(side),
            spec: `${values.against}+mutant:${mutant.id}`,
          },
          foundAt: new Date().toISOString(),
        },
        size: {
          original: p.programSize(killer),
          minimized: p.programSize(minimal),
        },
        mismatch: p.firstMismatch(
          p.interpret(ref, minimal, values.level),
          p.interpret(rt, minimal, values.level),
        ),
        program: minimal,
      });
    }
    const ms = performance.now() - began;
    rows.push({
      mutant: mutant.id,
      expected: mutant.expected,
      result: killed ? "killed" : "survived",
      by: killed
        ? killedBy === "witness"
          ? "witness"
          : `seed ${killedBy}`
        : `${values.budget} seeds`,
      witness: killed ? `size ${p.programSize(minimal)}` : "",
      verdict: ok ? "ok" : "UNEXPECTED",
      time: formatMs(ms),
    });
    records.push({
      id: mutant.id,
      expected: mutant.expected,
      killed,
      killedBy: killed ? killedBy : null,
      witnessSize: killed ? p.programSize(minimal) : null,
      ok,
      ms: Math.round(ms),
      ...(mutant.adHoc ? { mutation: mutationArgument(mutant) } : {}),
    });
  }

  console.log(
    `\nreference ${values.against}  policy ${policy}  level ${values.level}  budget ${values.budget}`,
  );
  console.log(table(rows));
  const scored = records.filter(
    (r) => r.expected !== "gap" && r.killed !== undefined,
  );
  const killedCount = scored.filter((r) => r.killed).length;
  const score = scored.length === 0 ? 1 : killedCount / scored.length;
  console.log(
    `\nmutation score ${killedCount}/${scored.length} (${(score * 100).toFixed(1)}%)` +
      (unexpected > 0 ? `, ${unexpected} unexpected` : ""),
  );
  if (values.record) console.log(`witnesses: ${packageRelative(witnessDir)}`);
  printReportPath(
    writeReport(
      "mutate",
      {
        status: unexpected === 0 ? "passed" : "failed",
        reference: describeSide(reference),
        policy,
        level: values.level,
        budget: values.budget,
        score,
        mutants: records,
      },
      values.report,
    ),
  );
  return unexpected === 0 ? 0 : 1;
}
