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

export const diagnostics: WorkloadDefinition[] = [
  ...[1, 4, 16].flatMap((depth) => [
    wideSharedSink(depth, "shared"),
    wideSharedSink(depth, "per-branch"),
  ]),
  rotatingDependencies(),
];

function wideSharedSink(
  depth: number,
  sinkLayout: "shared" | "per-branch",
): WorkloadDefinition {
  return {
    id: `wide-shared-sink/depth-${depth}/${sinkLayout}`,
    suite: "diagnostic",
    sourceGroup: "diagnostic",
    defaultSize: 1000,
    supportedPolicies: bothPolicies,
    setup(api, width, policy) {
      const counters = createCounters();
      const source = trackedSignal(api, counters, 0);
      const branches = Array.from({ length: width }, (_, branchIndex) => {
        let node = trackedComputed(api, counters, () =>
          Number(source.read()) + branchIndex,
        );
        for (let level = 1; level < depth; level++) {
          const previous = node;
          node = trackedComputed(api, counters, () => Number(previous.read()) + 1);
        }
        return node;
      });

      if (sinkLayout === "shared") {
        trackedEffect(api, counters, () => {
          let total = 0;
          for (const node of branches) total += Number(node.read());
          counters.checksum = total;
        });
      } else {
        for (const node of branches) {
          trackedEffect(api, counters, () => {
            counters.checksum += Number(node.read());
          });
        }
      }

      let value = 0;
      return instance(api, counters, () => {
        runWithPolicy(api, policy, () => source.write(++value));
      });
    },
  };
}

function rotatingDependencies(): WorkloadDefinition {
  return {
    id: "rotating-dependencies/rotate-by-one",
    suite: "diagnostic",
    sourceGroup: "diagnostic",
    defaultSize: 1000,
    supportedPolicies: bothPolicies,
    setup(api, width, policy) {
      const counters = createCounters();
      const offset = trackedSignal(api, counters, 0);
      const sources = Array.from({ length: width }, (_, index) =>
        trackedSignal(api, counters, index),
      );
      trackedEffect(api, counters, () => {
        const shift = Number(offset.read());
        let total = 0;
        for (let index = 0; index < width; index++) {
          total += Number(sources[(index + shift) % width]!.read());
        }
        counters.checksum = total;
      });
      let shift = 0;
      return instance(api, counters, () => {
        shift = (shift + 1) % width;
        runWithPolicy(api, policy, () => offset.write(shift));
      });
    },
  };
}
