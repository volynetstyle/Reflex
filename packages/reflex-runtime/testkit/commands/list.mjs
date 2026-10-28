import path from "node:path";
import { pathToFileURL } from "node:url";

import { UsageError } from "../lib/args.mjs";
import { loadOracle } from "../lib/engine.mjs";
import { packageRoot } from "../lib/paths.mjs";
import { FLAVORS } from "../lib/sides.mjs";
import { table } from "../lib/report.mjs";
import { GATES, LAYERS, SUITES, TIERS } from "../registry.mjs";

export const synopsis =
  "[suites | layers | tiers | gates | families | mutants | policies | variants | flavors]";
export const description =
  "Prints one catalog of the testkit (default: suites).";

export const options = {
  tier: { type: "string", describe: "suites: only those the tier runs" },
  layer: { type: "string", describe: "suites: only this layer" },
  json: { type: "boolean", describe: "print JSON instead of a table" },
};

async function catalog(what, values) {
  switch (what) {
    case "suites":
      return SUITES.filter(
        (item) =>
          (values.tier === undefined || item.tiers.includes(values.tier)) &&
          (values.layer === undefined || item.layer === values.layer),
      ).map((item) => ({
        id: item.id,
        layer: item.layer,
        tiers: item.tiers.join(",") || "(explicit)",
        technique: item.technique,
        owner: item.owner,
      }));
    case "layers":
      return Object.entries(LAYERS).map(([layer, summary]) => ({
        layer,
        suites: SUITES.filter((item) => item.layer === layer).length,
        summary,
      }));
    case "tiers":
      return Object.entries(TIERS).map(([tier, summary]) => ({
        tier,
        suites: SUITES.filter((item) => item.tiers.includes(tier)).length,
        summary,
      }));
    case "gates":
      return Object.entries(GATES).map(([gate, item]) => ({
        gate,
        summary: item.summary,
        runs: [item.tier ? `tier ${item.tier}` : "", ...item.suites]
          .filter(Boolean)
          .join(", "),
        obligations: item.manual.length,
      }));
    case "families": {
      const { families } = (await loadOracle()).families;
      return Object.values(families).map(({ id, summary }) => ({
        family: id,
        summary,
      }));
    }
    case "mutants": {
      const { MUTANTS } = await import(
        pathToFileURL(path.join(packageRoot, "testkit/oracle/mutants.ts")).href
      );
      return MUTANTS.map((mutant) => ({
        mutant: mutant.id,
        expected: mutant.expected,
        family: mutant.generator ?? "default",
        file: mutant.file,
      }));
    }
    case "policies": {
      const { verdict } = await loadOracle();
      const summaries = {
        exact: "traces byte-equal",
        representation:
          "list-order and event-order differences accepted, no new invariant violations",
        baseline:
          "representation plus the baseline corrections F13, F15, F1 domain, F17, F16",
      };
      return verdict.VERDICT_POLICIES.map((policy) => ({
        policy,
        accepts: summaries[policy],
      }));
    }
    case "variants": {
      const { variants } = await import(
        pathToFileURL(
          path.join(packageRoot, "perf/tracking-ladder/variants.mjs"),
        ).href
      );
      return Object.entries(variants).map(([variant, mutations]) => ({
        variant,
        mutations: mutations.length,
      }));
    }
    case "flavors":
      return FLAVORS.map((flavor) => ({ flavor }));
    default:
      throw new UsageError(`nothing called "${what}" to list`);
  }
}

export default async function listCommand(values, [what = "suites"]) {
  const rows = await catalog(what, values);
  console.log(values.json ? JSON.stringify(rows, null, 2) : table(rows));
  return 0;
}
