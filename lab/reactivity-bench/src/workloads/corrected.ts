import type { WorkloadDefinition } from "../types.js";
import {
  createCounters,
  instance,
  runWithPolicy,
  trackedComputed,
  trackedEffect,
  trackedSignal,
} from "./helpers.js";

const bothPolicies = ["eager", "batch"] as const;

export const vue12349Corrected: WorkloadDefinition[] = [
  initializedComputeds("dont-read-initialized-computeds-without-effect", false),
  initializedComputeds("dont-read-initialized-computeds-with-single-effect", true),
  trueSingleEffectRead(),
  ...[10, 100, 1000].map(batchedMutation),
];

function initializedComputeds(name: string, withEffect: boolean): WorkloadDefinition {
  return {
    id: `computed/${name}`,
    suite: "vue-12349-corrected",
    sourceGroup: "computed",
    defaultSize: 1000,
    supportedPolicies: bothPolicies,
    setup(api, size, policy) {
      const counters = createCounters();
      const source = trackedSignal(api, counters, 100);
      const nodes = Array.from({ length: size }, () =>
        trackedComputed(api, counters, () => Number(source.read()) * 2),
      );
      let initialized = 0;
      for (const node of nodes) initialized += Number(node.read());
      counters.checksum = initialized;
      if (withEffect) {
        trackedEffect(api, counters, () => {
          let total = 0;
          for (const node of nodes) total += Number(node.read());
          counters.checksum = total;
        });
      }
      let value = 100;
      return instance(api, counters, () => {
        runWithPolicy(api, policy, () => source.write(++value));
      });
    },
  };
}

function trueSingleEffectRead(): WorkloadDefinition {
  return {
    id: "computed/write-ref-read-1000-computeds-with-true-single-effect",
    suite: "vue-12349-corrected",
    sourceGroup: "computed",
    defaultSize: 1000,
    supportedPolicies: bothPolicies,
    setup(api, size, policy) {
      const counters = createCounters();
      const source = trackedSignal(api, counters, 100);
      const nodes = Array.from({ length: size }, () =>
        trackedComputed(api, counters, () => Number(source.read()) * 2),
      );
      trackedEffect(api, counters, () => {
        let total = 0;
        for (const node of nodes) total += Number(node.read());
        counters.checksum = total;
      });
      let value = 100;
      return instance(api, counters, () => {
        runWithPolicy(api, policy, () => source.write(++value));
        let total = 0;
        for (const node of nodes) total += Number(node.read());
        counters.checksum = total;
      });
    },
  };
}

function batchedMutation(size: number): WorkloadDefinition {
  return {
    id: `effect/1-effect-mutate-${size}-refs-corrected`,
    suite: "vue-12349-corrected",
    sourceGroup: "effect",
    defaultSize: size,
    supportedPolicies: bothPolicies,
    setup(api, requestedSize, policy) {
      const counters = createCounters();
      const refs = Array.from({ length: requestedSize }, (_, index) =>
        trackedSignal(api, counters, index),
      );
      trackedEffect(api, counters, () => {
        let total = 0;
        for (const ref of refs) total += Number(ref.read());
        counters.checksum = total;
      });
      let sequence = 0;
      return instance(api, counters, () => {
        runWithPolicy(api, policy, () => {
          for (let index = 0; index < refs.length; index++) {
            refs[index]!.write(index + sequence++);
          }
        });
      });
    },
  };
}
