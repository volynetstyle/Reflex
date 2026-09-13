import type { WorkloadDefinition } from "../types.js";
import {
  createCounters,
  instance,
  trackedComputed,
  trackedEffect,
  trackedSignal,
} from "./helpers.js";

const eagerOnly = ["eager"] as const;

export const vue12349Exact: WorkloadDefinition[] = [
  {
    id: "computed/create-computed",
    suite: "vue-12349-exact",
    sourceGroup: "computed",
    supportedPolicies: eagerOnly,
    setup(api) {
      const counters = createCounters();
      return instance(api, counters, () => {
        trackedComputed(api, counters, () => 100);
        counters.checksum++;
      });
    },
  },
  computedWriteCase(
    "write-ref-dont-read-computed-without-effect",
    1,
    "none",
    false,
  ),
  computedWriteCase(
    "write-ref-dont-read-computed-with-effect",
    1,
    "multiple",
    false,
  ),
  computedWriteCase(
    "write-ref-read-computed-without-effect",
    1,
    "none",
    true,
  ),
  computedWriteCase(
    "write-ref-read-computed-with-effect",
    1,
    "multiple",
    true,
  ),
  computedWriteCase(
    "write-ref-dont-read-1000-computeds-without-effect",
    1000,
    "none",
    false,
  ),
  computedWriteCase(
    "write-ref-dont-read-1000-computeds-with-multiple-effects",
    1000,
    "multiple",
    false,
  ),
  computedWriteCase(
    "write-ref-dont-read-1000-computeds-with-single-effect",
    1000,
    "single",
    false,
  ),
  computedWriteCase(
    "write-ref-read-1000-computeds-no-effect",
    1000,
    "none",
    true,
  ),
  computedWriteCase(
    "write-ref-read-1000-computeds-with-multiple-effects",
    1000,
    "multiple",
    true,
  ),
  // Literal source semantics: the loop installs 1000 effects and the block
  // below installs one more aggregate effect despite the benchmark name.
  computedWriteCase(
    "write-ref-read-1000-computeds-with-single-effect",
    1000,
    "multiple-plus-single",
    true,
  ),
  manyRefsOneComputed("1000-refs-read-1-computed-without-effect", false),
  manyRefsOneComputed("1000-refs-read-1-computed-with-effect", true),
  {
    id: "effect/single-ref-invoke",
    suite: "vue-12349-exact",
    sourceGroup: "effect",
    supportedPolicies: eagerOnly,
    setup(api) {
      const counters = createCounters();
      const value = trackedSignal(api, counters, 0);
      trackedEffect(api, counters, () => {
        counters.checksum = Number(value.read());
      });
      let index = 0;
      return instance(api, counters, () => value.write(index++));
    },
  },
  ...[1, 10, 100, 1000].map(createEffect),
  ...[1, 10, 100, 1000].map(createAndStopEffect),
  ...[10, 100, 1000].map(mutateRefs),
  ...[10, 100, 1000].map(branchToggle),
  ...[10, 100, 1000].map(invokeEffects),
  {
    id: "ref/create-ref",
    suite: "vue-12349-exact",
    sourceGroup: "ref",
    supportedPolicies: eagerOnly,
    setup(api) {
      const counters = createCounters();
      return instance(api, counters, () => {
        trackedSignal(api, counters, 100);
        counters.checksum++;
      });
    },
  },
  refCase("write-ref", "write"),
  refCase("read-ref", "read"),
  refCase("write-read-ref", "write-read"),
];

type EffectLayout = "none" | "multiple" | "single" | "multiple-plus-single";

function computedWriteCase(
  name: string,
  width: number,
  layout: EffectLayout,
  readAfterWrite: boolean,
): WorkloadDefinition {
  return {
    id: `computed/${name}`,
    suite: "vue-12349-exact",
    sourceGroup: "computed",
    defaultSize: width,
    supportedPolicies: eagerOnly,
    setup(api, requestedSize) {
      const size = width === 1 ? 1 : requestedSize;
      const counters = createCounters();
      const value = trackedSignal(api, counters, 100);
      const nodes = Array.from({ length: size }, () =>
        trackedComputed(api, counters, () => Number(value.read()) * 2),
      );

      if (layout === "multiple" || layout === "multiple-plus-single") {
        for (const node of nodes) {
          trackedEffect(api, counters, () => {
            counters.checksum = Number(node.read());
          });
        }
      }
      if (layout === "single" || layout === "multiple-plus-single") {
        trackedEffect(api, counters, () => {
          let total = 0;
          for (const node of nodes) total += Number(node.read());
          counters.checksum = total;
        });
      }

      let index = 0;
      return instance(api, counters, () => {
        value.write(index++);
        if (readAfterWrite) {
          let total = 0;
          for (const node of nodes) total += Number(node.read());
          counters.checksum = total;
        }
      });
    },
  };
}

function manyRefsOneComputed(name: string, withEffect: boolean): WorkloadDefinition {
  return {
    id: `computed/${name}`,
    suite: "vue-12349-exact",
    sourceGroup: "computed",
    defaultSize: 1000,
    supportedPolicies: eagerOnly,
    setup(api, size) {
      const counters = createCounters();
      const refs = Array.from({ length: size }, (_, index) =>
        trackedSignal(api, counters, index),
      );
      const total = trackedComputed(api, counters, () => {
        let next = 0;
        for (const ref of refs) next += Number(ref.read());
        return next;
      });
      if (withEffect) {
        trackedEffect(api, counters, () => {
          counters.checksum = Number(total.read());
        });
      }
      let index = 0;
      return instance(api, counters, () => {
        const target = refs[index++ % refs.length]!;
        target.write(Number(target.read()) + 1);
        counters.checksum = Number(total.read());
      });
    },
  };
}

function createEffect(size: number): WorkloadDefinition {
  return effectCreationCase("create-an-effect-that-tracks", size, false);
}

function createAndStopEffect(size: number): WorkloadDefinition {
  return effectCreationCase("create-and-stop-an-effect-that-tracks", size, true);
}

function effectCreationCase(prefix: string, size: number, stop: boolean): WorkloadDefinition {
  return {
    id: `effect/${prefix}-${size}-refs`,
    suite: "vue-12349-exact",
    sourceGroup: "effect",
    defaultSize: size,
    supportedPolicies: eagerOnly,
    setup(api, requestedSize) {
      const counters = createCounters();
      return instance(api, counters, () => {
        const refs = Array.from({ length: requestedSize }, (_, index) =>
          trackedSignal(api, counters, index),
        );
        const dispose = trackedEffect(api, counters, () => {
          let total = 0;
          for (const ref of refs) total += Number(ref.read());
          counters.checksum = total;
        });
        if (stop) dispose();
      });
    },
  };
}

function mutateRefs(size: number): WorkloadDefinition {
  return {
    id: `effect/1-effect-mutate-${size}-refs`,
    suite: "vue-12349-exact",
    sourceGroup: "effect",
    defaultSize: size,
    supportedPolicies: eagerOnly,
    setup(api, requestedSize) {
      const counters = createCounters();
      const refs = Array.from({ length: requestedSize }, (_, index) =>
        trackedSignal(api, counters, index),
      );
      trackedEffect(api, counters, () => {
        let total = 0;
        for (const ref of refs) total += Number(ref.read());
        counters.checksum = total;
      });
      let j = 0;
      return instance(api, counters, () => {
        for (let index = 0; index < refs.length; index++) {
          refs[index]!.write(index + j++);
        }
      });
    },
  };
}

function branchToggle(size: number): WorkloadDefinition {
  return {
    id: `effect/${size}-refs-branch-toggle`,
    suite: "vue-12349-exact",
    sourceGroup: "effect",
    defaultSize: size,
    supportedPolicies: eagerOnly,
    setup(api, requestedSize) {
      const counters = createCounters();
      const toggle = trackedSignal(api, counters, true);
      const refs = Array.from({ length: requestedSize }, (_, index) =>
        trackedSignal(api, counters, index),
      );
      trackedEffect(api, counters, () => {
        let total = 0;
        if (toggle.read()) {
          for (const ref of refs) total += Number(ref.read());
        }
        counters.checksum = total;
      });
      return instance(api, counters, () => toggle.write(!toggle.read()));
    },
  };
}

function invokeEffects(size: number): WorkloadDefinition {
  return {
    id: `effect/1-ref-invoking-${size}-effects`,
    suite: "vue-12349-exact",
    sourceGroup: "effect",
    defaultSize: size,
    supportedPolicies: eagerOnly,
    setup(api, requestedSize) {
      const counters = createCounters();
      const value = trackedSignal(api, counters, 0);
      for (let index = 0; index < requestedSize; index++) {
        trackedEffect(api, counters, () => {
          counters.checksum += Number(value.read());
        });
      }
      let index = 0;
      return instance(api, counters, () => value.write(index++));
    },
  };
}

function refCase(
  name: string,
  operation: "write" | "read" | "write-read",
): WorkloadDefinition {
  return {
    id: `ref/${name}`,
    suite: "vue-12349-exact",
    sourceGroup: "ref",
    supportedPolicies: eagerOnly,
    setup(api) {
      const counters = createCounters();
      const value = trackedSignal(api, counters, 100);
      let index = 0;
      return instance(api, counters, () => {
        if (operation !== "read") value.write(index++);
        if (operation !== "write") counters.checksum = Number(value.read());
      });
    },
  };
}

if (vue12349Exact.length !== 35) {
  throw new Error(`Expected 35 exact Vue workloads, got ${vue12349Exact.length}`);
}
