import { bench, describe } from "vitest";
import {
  createEquivalentCascade,
  createDynamicChurn,
  createKeyedLocality,
  type Strategy,
  type Workload,
} from "./semantic-workloads";

const full =
  (import.meta as ImportMeta & { env: { MODE?: string } }).env.MODE === "full";
const sizes = full ? [16, 256, 4_096] : [16, 256];
const fanouts = full ? [16, 256, 4_096] : [16, 256];
const equivalentRates = full ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
const downstreamCosts = full ? [0, 40, 400] : [0, 40];
const strategies: Strategy[] = ["identity", "deep", "projection"];

describe("Equivalent Cascade / Equivalence Probability / Fanout × Work Cost", () => {
  for (const fields of sizes) {
    for (const consumers of fanouts) {
      for (const equivalentRate of equivalentRates) {
        for (const downstreamIterations of downstreamCosts) {
          for (const strategy of strategies) {
            let workload: Workload | undefined;
            let cursor = 0;
            bench(
              `${strategy} fields=${fields} fanout=${consumers} peq=${equivalentRate} work=${downstreamIterations}`,
              () => {
                workload ??= createEquivalentCascade({
                  strategy,
                  fields,
                  consumers,
                  downstreamIterations,
                });
                cursor = (cursor + 0.618_033_988_75) % 1;
                workload.update(cursor < equivalentRate);
              },
            );
          }
        }
      }
    }
  }
});

describe("Semantic Locality / Keyed Locality", () => {
  for (const keys of full ? [16, 256, 1_024] : [16, 256]) {
    for (const consumersPerKey of [1, 4]) {
      for (const selector of [false, true]) {
        let workload: Workload | undefined;
        bench(
          `${selector ? "selector" : "generic"} keys=${keys} consumersPerKey=${consumersPerKey}`,
          () => {
            workload ??= createKeyedLocality({ keys, consumersPerKey, selector });
            workload.update(false);
          },
        );
      }
    }
  }
});

describe("Dynamic Churn", () => {
  for (const churn of full ? [0, 0.01, 0.1, 0.25, 0.5, 1] : [0, 0.1, 1]) {
    for (const strategy of strategies) {
      let workload: Workload | undefined;
      let cursor = 0;
      bench(`${strategy} churn=${churn}`, () => {
        workload ??= createDynamicChurn({ strategy, consumers: 64 });
        cursor = (cursor + 0.381_966_011_25) % 1;
        workload.update(cursor < churn);
      });
    }
  }
});
