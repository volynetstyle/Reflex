// Places reflex-dom in the official js-framework-benchmark tables.
//
//   node rank.mjs --official <js-framework-benchmark>/webdriver-ts-results/src/results.ts \
//                 --results <dir> [--out <dir>]
//
// <dir> holds one subdirectory per shard with the result files written by the
// official runner (webdriver-ts/results/*.json). Every shard ran reflex-dom
// next to anchors: frameworks of the official table measured on the same
// runner. For every benchmark and shard the local values of the anchors are
// mapped onto the official values, and reflex-dom is mapped the same way:
//
//   ratio   official = k · local          (k: geometric mean of official/local)
//   linear  official = a + c · local      (least squares; a fixed cost such as
//                                          paint that differs between machines)
//
// Each estimate is inserted into the complete official table, and the place is
// computed exactly like the results app: factor = mean / best mean of the
// benchmark, weighted geometric mean of the factors (official CPU weights,
// weight 1 otherwise), ascending. Sizes are bytes and are used as measured.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CPU_WEIGHTS = [
  0.64280248137063, 0.5607178150466176, 0.5643800750716564, 0.1925635870170522, 0.13200612879341714,
  0.5277091212292658, 0.5644449600965534, 0.5508359820582848, 0.4225836631419211,
];
const TYPES = { 0: "CPU", 1: "memory", 5: "size" };
const TARGET = /^reflex-dom-v.*-keyed$/;
const UNCALIBRATED = new Set(["41_size-uncompressed", "42_size-compressed"]);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const geomean = (values) => Math.exp(mean(values.map(Math.log)));

/** Reads `results`, `frameworks` and `benchmarks` from the results app's results.ts. */
function readOfficial(path) {
  const source = readFileSync(path, "utf8");
  const exported = (name) => {
    const start = source.indexOf(`export const ${name}`);
    if (start === -1) throw new Error(`${name} not found in ${path}`);
    const next = source.indexOf("\nexport ", start + 1);
    const head = source.slice(start, next === -1 ? undefined : next);
    const body = head.slice(head.search(/=\s*\[/) + 1).trim().replace(/;$/, "");
    // Array literals of plain data, with trailing commas: valid JSON without them.
    return JSON.parse(body.replace(/,\s*([\]}])/g, "$1"));
  };
  const frameworks = exported("frameworks");
  const benchmarks = exported("benchmarks");
  const table = new Map();

  for (const raw of exported("results")) {
    const framework = frameworks[raw.f];
    if (!framework.keyed) continue;
    const values = new Map();
    for (const entry of raw.b) {
      const series = entry.v.total ?? entry.v.DEFAULT;
      if (series?.length) values.set(benchmarks[entry.b].id, mean(series));
    }
    table.set(framework.name, values);
  }

  return { benchmarks, table };
}

/** Reads the local result files: shard -> framework -> benchmark -> mean. */
function readLocal(directory) {
  const shards = new Map();
  for (const shard of readdirSync(directory)) {
    const shardDirectory = join(directory, shard);
    if (!statSync(shardDirectory).isDirectory()) continue;
    const frameworks = new Map();
    for (const file of readdirSync(shardDirectory)) {
      if (!file.endsWith(".json")) continue;
      const result = JSON.parse(readFileSync(join(shardDirectory, file), "utf8"));
      if (!result.keyed) continue;
      const stat = result.values.total ?? result.values.DEFAULT;
      if (stat === undefined) continue;
      if (!frameworks.has(result.framework)) frameworks.set(result.framework, new Map());
      frameworks.get(result.framework).set(result.benchmark, stat.mean);
    }
    if (frameworks.size > 0) shards.set(shard, frameworks);
  }
  return shards;
}

function fitRatio(points) {
  const k = geomean(points.map(([local, official]) => official / local));
  const residuals = points.map(([local, official]) => Math.log(official / (k * local)));
  return { predict: (x) => k * x, error: Math.sqrt(mean(residuals.map((r) => r * r))) };
}

function fitLinear(points) {
  const mx = mean(points.map(([x]) => x));
  const my = mean(points.map(([, y]) => y));
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  const c = sxx === 0 ? 0 : sxy / sxx;
  if (!(c > 0) || points.length < 3) return null;
  const a = my - c * mx;
  const residuals = points.map(([x, y]) => Math.log(Math.max(a + c * x, 1e-9) / y));
  return { predict: (x) => Math.max(a + c * x, 1e-9), error: Math.sqrt(mean(residuals.map((r) => r * r))) };
}

/** Estimated official values of the target for every benchmark, per model. */
function estimate(official, local, model) {
  const values = new Map();
  const fits = new Map();

  for (const { id } of official.benchmarks) {
    const perShard = [];
    const errors = [];
    let anchors = 0;

    for (const frameworks of local.values()) {
      const target = [...frameworks].find(([name]) => TARGET.test(name))?.[1].get(id);
      if (target === undefined) continue;

      if (UNCALIBRATED.has(id)) {
        perShard.push(target);
        continue;
      }

      const points = [];
      for (const [name, measured] of frameworks) {
        const reference = official.table.get(name)?.get(id);
        const value = measured.get(id);
        if (reference > 0 && value > 0) points.push([value, reference]);
      }
      if (points.length === 0) continue;

      const fit = (model === "linear" && fitLinear(points)) || fitRatio(points);
      perShard.push(fit.predict(target));
      errors.push(fit.error);
      anchors += points.length;
    }

    if (perShard.length > 0) {
      values.set(id, geomean(perShard));
      fits.set(id, { anchors, error: errors.length ? mean(errors) : 0 });
    }
  }

  return { values, fits };
}

/** Places of all frameworks in one table, as the results app sorts them. */
function rank(benchmarks, table, type) {
  const ids = benchmarks.filter((b) => b.type === type).map((b) => b.id);
  const weights = type === 0 ? CPU_WEIGHTS : ids.map(() => 1);
  const best = ids.map((id) =>
    Math.min(...[...table.values()].map((values) => values.get(id)).filter((v) => v > 0)),
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  return [...table]
    .map(([name, values]) => {
      let sum = 0;
      let any = false;
      ids.forEach((id, index) => {
        const value = values.get(id);
        if (value > 0) {
          sum += weights[index] * Math.log(value / best[index]);
          any = true;
        }
      });
      return { name, score: any ? Math.exp(sum / totalWeight) : Number.POSITIVE_INFINITY };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score);
}

/** Order of the frameworks measured on the runner, pooled through vanillajs. */
function sameRunner(benchmarks, local, type) {
  const pooled = new Map();
  for (const frameworks of local.values()) {
    const vanilla = [...frameworks].find(([name]) => name.startsWith("vanillajs-keyed"))?.[1];
    if (vanilla === undefined) continue;
    for (const [name, values] of frameworks) {
      if (!pooled.has(name)) pooled.set(name, new Map());
      for (const [id, value] of values) {
        const base = vanilla.get(id);
        if (base > 0) (pooled.get(name).get(id) ?? pooled.get(name).set(id, []).get(id)).push(value / base);
      }
    }
  }
  const table = new Map(
    [...pooled].map(([name, values]) => [name, new Map([...values].map(([id, r]) => [id, geomean(r)]))]),
  );
  return rank(benchmarks, table, type);
}

const official = readOfficial(argument("official"));
const local = readLocal(argument("results"));
const outDirectory = argument("out", argument("results"));

const targetName = [...local.values()]
  .flatMap((frameworks) => [...frameworks.keys()])
  .find((name) => TARGET.test(name));
if (targetName === undefined) throw new Error("no reflex-dom results found");

const report = { target: targetName, shards: [...local.keys()], tables: {} };
const lines = [
  `# ${targetName} in the official js-framework-benchmark tables`,
  "",
  `Shards: ${report.shards.length}. Anchors measured on the same runner: ${
    new Set([...local.values()].flatMap((f) => [...f.keys()]).filter((n) => !TARGET.test(n))).size
  }.`,
  "",
];

for (const [type, label] of Object.entries(TYPES).map(([t, l]) => [Number(t), l])) {
  const ids = official.benchmarks.filter((b) => b.type === type).map((b) => b.id);
  const tableReport = {};
  lines.push(`## ${label}`, "");
  lines.push("| model | place | of | score |", "| --- | --- | --- | --- |");

  for (const model of ["ratio", "linear"]) {
    const { values, fits } = estimate(official, local, model);
    const table = new Map(official.table);
    table.set(`${targetName} (estimate)`, values);
    const places = rank(official.benchmarks, table, type);
    const index = places.findIndex((entry) => entry.name === `${targetName} (estimate)`);
    if (index === -1) continue;

    tableReport[model] = {
      place: index + 1,
      of: places.length,
      score: places[index].score,
      values: Object.fromEntries(ids.filter((id) => values.has(id)).map((id) => [id, values.get(id)])),
      fits: Object.fromEntries(ids.filter((id) => fits.has(id)).map((id) => [id, fits.get(id)])),
      neighbours: places.slice(Math.max(0, index - 5), index + 6).map((e) => [e.name, e.score]),
    };
    lines.push(`| ${model} | **${index + 1}** | ${places.length} | ${places[index].score.toFixed(3)} |`);
  }

  const measured = sameRunner(official.benchmarks, local, type);
  const own = measured.findIndex((entry) => entry.name === targetName);
  if (own !== -1) {
    tableReport.sameRunner = measured.map((entry) => [entry.name, entry.score]);
    lines.push(
      "",
      `Same runner, measured frameworks only (factor vs. vanillajs, ${own + 1} of ${measured.length}):`,
      "",
      "| # | framework | score (local) | official place |",
      "| --- | --- | --- | --- |",
    );
    const officialPlaces = rank(official.benchmarks, official.table, type).map((e) => e.name);
    measured.forEach((entry, index) => {
      const place = officialPlaces.indexOf(entry.name);
      const name = index === own ? `**${entry.name}**` : entry.name;
      lines.push(`| ${index + 1} | ${name} | ${entry.score.toFixed(3)} | ${place === -1 ? "—" : place + 1} |`);
    });
  }

  if (tableReport.linear ?? tableReport.ratio) {
    const { values, fits } = tableReport.linear ?? tableReport.ratio;
    lines.push("", "| benchmark | estimated official mean | anchors | fit error (log rms) |", "| --- | --- | --- | --- |");
    for (const id of Object.keys(values)) {
      lines.push(`| ${id} | ${values[id].toFixed(2)} | ${fits[id].anchors} | ${fits[id].error.toFixed(3)} |`);
    }
  }

  lines.push("");
  report.tables[label] = tableReport;
}

mkdirSync(outDirectory, { recursive: true });
writeFileSync(join(outDirectory, "ranking.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDirectory, "ranking.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
