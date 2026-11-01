import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseDuration, UsageError } from "../lib/args.mjs";
import { loadOracle } from "../lib/engine.mjs";
import { instrument } from "../lib/mutation.mjs";
import { cacheRoot, packageRelative, packageRoot } from "../lib/paths.mjs";
import { vitestArgs, vitestCli } from "../lib/process.mjs";
import {
  formatMs,
  printReportPath,
  table,
  writeReport,
} from "../lib/report.mjs";
import { buildSide, loadSide } from "../lib/sides.mjs";
import { SUITES, TIERS } from "../registry.mjs";

export const synopsis = "[options]";
export const description = [
  "Cross-suite fault audit. Every mutant of the fault-model inventory",
  "(testkit/oracle/faults.ts) is applied to `src` and run against every gating",
  "vitest suite of the tier and the advisory characterization layer, after a",
  "control run without mutation. Each mutant is traced through four stages:",
  "",
  "  reach      the mutated site executes (probe, per test file)",
  "  infect     the strict trace of a generated program differs (state, graph)",
  "  propagate  its public projection differs: values and effects, or host calls",
  "  observe    a test file fails",
  "",
  "The report names, per test file, the mutants only it detects, and a",
  "cheapest cover of the development kills, evaluated on the holdout mutants",
  "it was not chosen from. Kill-set redundancy is a necessary condition for",
  "removing a test, never a sufficient one (testkit/README.md, Audit).",
].join("\n");

export const options = {
  mutants: {
    type: "list",
    describe: "mutant ids (default: the whole inventory)",
  },
  role: {
    type: "string",
    default: "all",
    describe: "development | holdout | all",
  },
  tier: {
    type: "string",
    default: "ci",
    describe: "the budgets the suites run with",
  },
  corpus: {
    type: "number",
    min: 0,
    default: 300,
    describe: "generated programs per mutant for infect/propagate (0: skip)",
  },
  timeout: {
    type: "string",
    default: "10m",
    describe: "time box of one vitest process",
  },
  report: {
    type: "string",
    placeholder: "file",
    describe: "write the run record here",
  },
};

const auditDir = path.join(cacheRoot, "audit");

/** The vitest suites the audit runs, grouped into one process per config. */
function plan(tier) {
  const suites = SUITES.filter(
    (item) =>
      item.runner.type === "vitest" &&
      item.runner.cwd === undefined &&
      item.layer !== "qualification" &&
      (item.tiers.includes(tier) || item.advisory === true),
  );
  const steps = new Map();
  for (const item of suites) {
    const profile = item.runner.profile;
    let step = steps.get(profile);
    if (step === undefined) {
      step = { profile, files: [], env: {}, suites: [] };
      steps.set(profile, step);
    }
    step.suites.push(item);
    step.files.push(...(item.files ?? []));
    Object.assign(step.env, item.budgets?.[tier] ?? {});
  }
  return { suites, steps: [...steps.values()] };
}

/** The suite owning a package-relative test file. */
function ownerOf(suites, file) {
  return suites.find((item) =>
    (item.files ?? []).some((owned) =>
      owned.endsWith("/") ? file.startsWith(owned) : file === owned,
    ),
  );
}

/** Runs one vitest process; resolves { code, timedOut, ms }. */
function runVitest(step, env, outputFile, timeoutMs) {
  const began = performance.now();
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        vitestCli(),
        "run",
        ...vitestArgs({ profile: step.profile }),
        ...step.files,
        "--reporter=json",
        `--outputFile=${outputFile}`,
      ],
      {
        cwd: packageRoot,
        env: { ...process.env, ...step.env, ...env },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, ms: performance.now() - began });
    });
  });
}

/**
 * Runs every step; returns { files: Map<file, { status, ms, hits }>, steps }.
 * A step that timed out or wrote no report marks its files `timeout` or
 * `crashed`: detected, but not attributable to one file.
 */
async function runAll(steps, mutation, label, timeoutMs) {
  const files = new Map();
  const outcomes = [];
  const dir = path.join(auditDir, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [index, step] of steps.entries()) {
    const output = path.join(dir, `step-${index}.json`);
    const reach = path.join(dir, `reach-${index}.jsonl`);
    const env =
      mutation === undefined
        ? { REFLEX_MUTATIONS: "" }
        : {
            REFLEX_MUTATIONS: JSON.stringify([mutation]),
            REFLEX_REACH_FILE: reach,
          };
    const { code, timedOut, ms } = await runVitest(
      step,
      env,
      output,
      timeoutMs,
    );
    outcomes.push({
      profile: step.profile,
      code,
      timedOut,
      ms: Math.round(ms),
    });
    const hits = new Map();
    if (existsSync(reach))
      for (const line of readFileSync(reach, "utf8").split("\n"))
        if (line !== "") {
          const { file, hits: count } = JSON.parse(line);
          const key = packageRelative(file);
          hits.set(key, (hits.get(key) ?? 0) + count);
        }
    if (timedOut || !existsSync(output)) {
      files.set(`<${step.profile}>`, {
        status: timedOut ? "timeout" : "crashed",
        ms,
      });
      continue;
    }
    const report = JSON.parse(readFileSync(output, "utf8"));
    for (const result of report.testResults) {
      const file = packageRelative(result.name);
      files.set(file, {
        status: result.status,
        ms: result.endTime - result.startTime,
        hits: mutation === undefined ? undefined : (hits.get(file) ?? 0),
      });
    }
  }
  return { files, steps: outcomes };
}

const PROJECTIONS = {
  value: ["read:", "w:", "cl:", "err:"],
  host: ["inv:", "inv-owned:", "idle:", "hook-action:", "flush-cap:"],
};
const project = (trace, prefixes) =>
  trace.filter((entry) => prefixes.some((prefix) => entry.startsWith(prefix)));
const same = (a, b) =>
  a.length === b.length && a.every((entry, index) => entry === b[index]);

// The same programs for every mutant, so stage counts compare across mutants.
// `general` instead of the frozen `default`, whose low seeds are wide or deep
// specs only; seeds start at 1,000 for `swarm`, which is built on `default`.
const CORPUS_FAMILIES = ["general", "hub", "swarm", "targeted"];
const CORPUS_FIRST_SEED = 1000;

/** Infect and propagate over generated programs: counts and first programs. */
async function corpusStages(reference, mutant, count) {
  const { program: p, families } = await loadOracle();
  const side = await buildSide("source", {
    flavor: "oracle",
    extraMutations: [`${mutant.file}::${mutant.search}::${mutant.replace}`],
    quiet: true,
  });
  const rt = await loadSide(side);
  const stage = { infect: 0, value: 0, host: 0, invariant: 0, first: {} };
  const trace = (runtime, program) => {
    try {
      return p.interpret(runtime, program, "strict", { invariants: true });
    } catch (error) {
      return [`crash:${error?.message ?? error}`];
    }
  };
  for (let index = 0; index < count; index++) {
    const id = CORPUS_FAMILIES[index % CORPUS_FAMILIES.length];
    const seed = CORPUS_FIRST_SEED + Math.floor(index / CORPUS_FAMILIES.length);
    const program = families.family(id).generate(seed);
    const a = trace(reference, program);
    const b = trace(rt, program);
    if (same(a, b)) continue;
    const hit = (name) => {
      stage[name]++;
      stage.first[name] ??= `${id}/${seed}`;
    };
    hit("infect");
    const crashed = b[0]?.startsWith("crash:") === true;
    if (
      crashed ||
      !same(project(a, PROJECTIONS.value), project(b, PROJECTIONS.value))
    )
      hit("value");
    if (!same(project(a, PROJECTIONS.host), project(b, PROJECTIONS.host)))
      hit("host");
    const known = new Set(a.filter((entry) => entry.startsWith("invariant:")));
    if (b.some((entry) => entry.startsWith("invariant:") && !known.has(entry)))
      hit("invariant");
  }
  return stage;
}

/** Greedy weighted set cover of `universe` by files' kill sets. */
export function cheapestCover(universe, kills, cost) {
  const uncovered = new Set(universe);
  const chosen = [];
  while (uncovered.size > 0) {
    let best;
    let bestRatio = -1;
    for (const [file, killed] of kills) {
      if (chosen.includes(file)) continue;
      let gain = 0;
      for (const id of killed) if (uncovered.has(id)) gain++;
      if (gain === 0) continue;
      const ratio = gain / Math.max(1, cost(file));
      if (ratio > bestRatio) {
        best = file;
        bestRatio = ratio;
      }
    }
    if (best === undefined) break;
    chosen.push(best);
    for (const id of kills.get(best)) uncovered.delete(id);
  }
  return chosen;
}

export default async function auditCommand(values, positionals) {
  if (positionals.length > 0)
    throw new UsageError(`unexpected argument ${positionals[0]}`);
  if (!(values.tier in TIERS))
    throw new UsageError(`unknown tier "${values.tier}"`);
  if (!["all", "development", "holdout"].includes(values.role))
    throw new UsageError(`unknown role "${values.role}"`);
  const timeoutMs = parseDuration(values.timeout);
  const { AUDIT_MUTANTS, FAULT_MODELS, inventoryErrors } = await import(
    pathToFileURL(path.join(packageRoot, "testkit/oracle/faults.ts")).href
  );
  const errors = inventoryErrors();
  if (errors.length > 0)
    throw new UsageError(`fault inventory: ${errors.join("; ")}`);
  let mutants = AUDIT_MUTANTS.filter(
    (m) => values.role === "all" || m.role === values.role,
  );
  if (values.mutants !== undefined)
    mutants = values.mutants.map((id) => {
      const found = AUDIT_MUTANTS.find((m) => m.id === id);
      if (found === undefined) throw new UsageError(`unknown mutant "${id}"`);
      return found;
    });
  const faultOf = new Map(FAULT_MODELS.map((fault) => [fault.id, fault]));

  const { suites, steps } = plan(values.tier);
  const advisory = (file) => ownerOf(suites, file)?.advisory === true;
  console.log(
    `audit: ${mutants.length} mutants x ${suites.length} suites in ${steps.length} processes (tier ${values.tier})`,
  );

  // Control: without a mutation every file must pass, or its failures under
  // a mutant mean nothing.
  const control = await runAll(steps, undefined, "control", timeoutMs);
  const broken = [...control.files]
    .filter(([, result]) => result.status !== "passed")
    .map(([file]) => file);
  console.log(
    `control: ${control.files.size} files, ${broken.length} not passing` +
      (broken.length > 0 ? `: ${broken.join(", ")}` : ""),
  );
  const cost = (file) => control.files.get(file)?.ms ?? 0;

  const reference =
    values.corpus > 0
      ? await loadSide(await buildSide("source", { flavor: "oracle" }))
      : undefined;

  const records = [];
  for (const mutant of mutants) {
    const began = performance.now();
    const source = readFileSync(path.join(packageRoot, mutant.file), "utf8");
    let probe;
    try {
      probe = instrument(source, mutant);
    } catch (error) {
      records.push({ ...mutant, status: "unbuildable", error: error.message });
      console.log(`${mutant.id}: unbuildable (${error.message})`);
      continue;
    }
    const run = await runAll(steps, mutant, mutant.id, timeoutMs);
    const killers = [];
    const reached = [];
    let unattributed = false;
    for (const [file, result] of run.files) {
      if (file.startsWith("<")) {
        unattributed = true;
        continue;
      }
      if (broken.includes(file)) continue;
      if (result.status !== "passed") killers.push(file);
      if (result.hits > 0) reached.push(file);
    }
    const stages =
      reference === undefined
        ? undefined
        : await corpusStages(reference, mutant, values.corpus);
    const gating = killers.filter((file) => !advisory(file));
    const record = {
      id: mutant.id,
      fault: mutant.fault,
      contract: faultOf.get(mutant.fault).contract,
      role: mutant.role,
      origin: mutant.origin,
      probed: probe.probed,
      occurrences: probe.occurrences,
      reachedFiles: reached,
      killers,
      gatingKillers: gating,
      unattributed,
      stages,
      steps: run.steps,
      ms: Math.round(performance.now() - began),
    };
    records.push(record);
    const reach = probe.probed ? `${reached.length} files` : "unmeasured";
    console.log(
      `${mutant.id}: ${gating.length > 0 ? `killed by ${gating.length} gating files` : unattributed ? "detected (timeout or crash)" : "SURVIVED the gating suites"}` +
        `, reach ${reach}` +
        (stages === undefined
          ? ""
          : `, corpus infect ${stages.infect} value ${stages.value} host ${stages.host} invariant ${stages.invariant} /${values.corpus}`) +
        ` (${formatMs(record.ms)})`,
    );
  }

  const scored = records.filter((r) => r.status !== "unbuildable");
  printMutants(scored, values.corpus);
  printFaultMatrix(scored, suites, FAULT_MODELS);
  const analysis = analyze(scored, control, broken, advisory, cost);
  printAnalysis(analysis);

  printReportPath(
    writeReport(
      "audit",
      {
        status: "completed",
        tier: values.tier,
        corpus: values.corpus,
        control: {
          files: control.files.size,
          broken,
          steps: control.steps,
        },
        mutants: records,
        analysis,
      },
      values.report,
    ),
  );
  // The audit is evidence, not a verdict: it fails only when the evidence is
  // void (a file fails without mutation, a mutant no longer applies).
  const unbuildable = records.filter((r) => r.status === "unbuildable");
  return broken.length === 0 && unbuildable.length === 0 ? 0 : 1;
}

function printMutants(records, corpus) {
  console.log("\nmutants (reach / infect / propagate / observe)");
  console.log(
    table(
      records.map((r) => ({
        mutant: r.id,
        fault: r.fault,
        role: r.role,
        reach: r.probed ? String(r.reachedFiles.length) : "?",
        infect: r.stages ? `${r.stages.infect}/${corpus}` : "",
        value: r.stages ? String(r.stages.value) : "",
        host: r.stages ? String(r.stages.host) : "",
        inv: r.stages ? String(r.stages.invariant) : "",
        observe: String(r.gatingKillers.length),
        advisory: String(r.killers.length - r.gatingKillers.length),
      })),
    ),
  );
}

/** Fault model x layer: how many mutants of the model the layer kills. */
function printFaultMatrix(records, suites, faults) {
  const layers = [...new Set(suites.map((item) => item.layer))];
  const layerOf = (file) => ownerOf(suites, file)?.layer;
  const rows = faults.map((fault) => {
    const mine = records.filter((r) => r.fault === fault.id);
    const row = {
      fault: fault.id,
      contract: fault.contract,
      n: String(mine.length),
    };
    for (const layer of layers) {
      const killed = mine.filter((r) =>
        r.killers.some((file) => layerOf(file) === layer),
      ).length;
      row[layer] = mine.length === 0 ? "" : killed === 0 ? "-" : String(killed);
    }
    return row;
  });
  console.log(
    "\nfault model x layer (mutants killed by any file of the layer)",
  );
  console.log(table(rows));
}

function analyze(records, control, broken, advisory, cost) {
  const gatingFiles = [...control.files.keys()].filter(
    (file) =>
      !file.startsWith("<") && !broken.includes(file) && !advisory(file),
  );
  const killsOf = (role) => {
    const kills = new Map(gatingFiles.map((file) => [file, new Set()]));
    for (const r of records)
      if (r.role === role)
        for (const file of r.gatingKillers) kills.get(file)?.add(r.id);
    return kills;
  };
  const development = killsOf("development");
  const holdout = killsOf("holdout");
  const union = (kills, files) => {
    const all = new Set();
    for (const file of files) for (const id of kills.get(file)) all.add(id);
    return all;
  };
  const developmentKilled = union(development, gatingFiles);
  const holdoutKilled = union(holdout, gatingFiles);

  const sole = [];
  for (const file of gatingFiles) {
    const others = gatingFiles.filter((other) => other !== file);
    const only = (kills) => {
      const rest = union(kills, others);
      return [...kills.get(file)].filter((id) => !rest.has(id));
    };
    const ids = [...only(development), ...only(holdout)];
    if (ids.length > 0) sole.push({ file, mutants: ids });
  }
  const stubborn = records
    .filter((r) => r.gatingKillers.length > 0 && r.gatingKillers.length <= 2)
    .map((r) => ({ mutant: r.id, role: r.role, files: r.gatingKillers }));
  const survivors = records
    .filter((r) => r.gatingKillers.length === 0)
    .map((r) => ({
      mutant: r.id,
      role: r.role,
      reached: r.probed ? r.reachedFiles.length > 0 : null,
      onlyAdvisory: r.killers.length > 0,
      unattributed: r.unattributed,
      stages: r.stages,
    }));
  const noKills = gatingFiles.filter(
    (file) => development.get(file).size === 0 && holdout.get(file).size === 0,
  );

  const cover = cheapestCover(developmentKilled, development, cost);
  const coverHoldout = union(holdout, cover);
  const lost = [...holdoutKilled].filter((id) => !coverHoldout.has(id));
  const seconds = (files) =>
    Math.round(files.reduce((sum, file) => sum + cost(file), 0)) / 1000;

  return {
    gatingFiles: gatingFiles.length,
    developmentKilled: developmentKilled.size,
    holdoutKilled: holdoutKilled.size,
    sole,
    stubborn,
    survivors,
    noKills,
    cover: {
      files: cover,
      seconds: seconds(cover),
      totalSeconds: seconds(gatingFiles),
      holdoutLost: lost,
    },
  };
}

function printAnalysis(a) {
  console.log(
    `\ngating files ${a.gatingFiles}; development mutants killed ${a.developmentKilled}, holdout killed ${a.holdoutKilled}`,
  );
  if (a.survivors.length > 0) {
    console.log("\nsurvivors of the gating suites");
    console.log(
      table(
        a.survivors.map((s) => ({
          mutant: s.mutant,
          role: s.role,
          reached: s.reached === null ? "?" : String(s.reached),
          infect: s.stages ? String(s.stages.infect) : "",
          propagate: s.stages ? String(s.stages.value + s.stages.host) : "",
          "only advisory": String(s.onlyAdvisory),
        })),
      ),
    );
  }
  console.log("\nsole witnesses (do not remove: the only gating detector)");
  console.log(
    a.sole.length === 0
      ? "  none"
      : table(
          a.sole.map((s) => ({ file: s.file, mutants: s.mutants.join(", ") })),
        ),
  );
  console.log("\nstubborn mutants (killed by at most two gating files)");
  console.log(
    a.stubborn.length === 0
      ? "  none"
      : table(
          a.stubborn.map((s) => ({
            mutant: s.mutant,
            role: s.role,
            files: s.files.join(", "),
          })),
        ),
  );
  console.log(
    `\n${a.noKills.length} gating files kill no mutant of this inventory. That is a`,
  );
  console.log(
    "gap of the inventory as much as of the file: none is a deletion candidate by this alone.",
  );
  console.log(
    `\ncheapest cover of the development kills: ${a.cover.files.length} of ${a.gatingFiles} files, ` +
      `${a.cover.seconds} s of ${a.cover.totalSeconds} s`,
  );
  console.log(
    a.cover.holdoutLost.length === 0
      ? "holdout check: the cover keeps every holdout kill"
      : `holdout check: the cover LOSES ${a.cover.holdoutLost.length} holdout kills (${a.cover.holdoutLost.join(", ")}): reduction by development kills overfits`,
  );
}
