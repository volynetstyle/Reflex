import {
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  endBatch as alienEndBatch,
  signal as alienSignal,
  startBatch as alienStartBatch,
} from "alien-signals";
import {
  createMemo as solidMemo,
  createRoot as solidRoot,
  createSignal as solidSignal,
  createTrackedEffect as solidTrackedEffect,
  flush as solidFlush,
} from "@solidjs/signals";
import {
  computed as vueComputed,
  effect as vueEffect,
  effectScope as vueEffectScope,
  ref as vueRef,
  stop as vueStop,
} from "@vue/reactivity";
import * as reflexCurrent from "../../dist/esm/index.js";
import * as reflexE87bb66 from "../../../../.bench-worktrees/reflex-e87bb66/packages/reflex/dist/esm/index.js";

export const FRAMEWORKS = [
  "reflex",
  "reflex-e87bb66",
  "alien",
  "solid2",
  "vue",
];

export const FRAMEWORK_LABELS = {
  reflex: "Reflex working tree",
  "reflex-e87bb66": "Reflex e87bb66",
  alien: "alien-signals 3.2.1",
  solid2: "@solidjs/signals 2.0.0-rc.9",
  vue: "@vue/reactivity 3.5.43",
};

export const FRAMEWORK_METADATA = {
  reflex: {
    package: "@volynets/reflex",
    source: "local working tree production build",
  },
  "reflex-e87bb66": {
    package: "@volynets/reflex",
    commit: "e87bb662be4e1bc4fb9885360d214017e8ba3a5c",
    branch: "benchmark/reflex-e87bb66",
    source: "linked worktree production build",
  },
  alien: { package: "alien-signals", version: "3.2.1" },
  solid2: { package: "@solidjs/signals", version: "2.0.0-rc.9" },
  vue: { package: "@vue/reactivity", version: "3.5.43" },
};

function assertFramework(framework) {
  if (!FRAMEWORKS.includes(framework)) {
    throw new Error(`Unknown framework: ${framework}`);
  }
}

function reflexSession(reflex, setup) {
  reflex.createRuntime({ effectStrategy: "flush" });
  const disposers = [];
  const api = {
    capabilities: {
      publicBatch: true,
      reentrantEffectWrites: true,
      scheduledEffects: true,
    },
    signal(initial) {
      const cell = reflex.signal(initial);
      return { read: cell, write: (value) => void cell.set(value) };
    },
    computed(fn) {
      return { read: reflex.computed(fn) };
    },
    effect(fn) {
      const dispose = reflex.effect(() => {
        fn();
      });
      disposers.push(dispose);
      return dispose;
    },
    batch: reflex.batch,
    flush: reflex.flush,
  };
  const instance = setup(api);
  reflex.flush();
  return {
    api,
    instance,
    dispose() {
      for (let index = disposers.length - 1; index >= 0; index--) {
        disposers[index]();
      }
      disposers.length = 0;
    },
  };
}

function alienSession(setup) {
  let instance;
  const api = {
    capabilities: {
      publicBatch: true,
      reentrantEffectWrites: false,
      scheduledEffects: false,
    },
    signal(initial) {
      const cell = alienSignal(initial);
      return { read: cell, write: (value) => void cell(value) };
    },
    computed(fn) {
      return { read: alienComputed(fn) };
    },
    effect(fn) {
      return alienEffect(() => {
        fn();
      });
    },
    batch(fn) {
      alienStartBatch();
      try {
        return fn();
      } finally {
        alienEndBatch();
      }
    },
    flush() {},
  };
  const dispose = alienEffectScope(() => {
    instance = setup(api);
  });
  return { api, instance, dispose };
}

function solidSession(setup) {
  let instance;
  let disposeRoot;
  let batchDepth = 0;
  const api = {
    capabilities: {
      publicBatch: true,
      reentrantEffectWrites: false,
      scheduledEffects: true,
    },
    signal(initial) {
      const [read, write] = solidSignal(initial);
      return { read, write: (value) => void write(value) };
    },
    computed(fn) {
      return { read: solidMemo(fn, { sync: true }) };
    },
    effect(fn) {
      const create = () =>
        solidRoot((dispose) => {
          // createTrackedEffect is Solid's public single-phase tracked
          // observer. Using createEffect(fn, noop) would add a second
          // scheduled callback which the other adapters do not perform.
          solidTrackedEffect(() => {
            fn();
          });
          return dispose;
        });
      // The common adapter contract observes the initial value before effect()
      // returns. Solid queues tracked effects, so drain creation unless an
      // enclosing public transaction will do it once for the whole group.
      return batchDepth > 0 ? create() : solidFlush(create);
    },
    batch(fn) {
      batchDepth++;
      try {
        return solidFlush(fn);
      } finally {
        batchDepth--;
      }
    },
    // flush(fn) is both Solid's transaction and its drain boundary. The
    // generic settle helper calls flush after batch, so keep that second step
    // a no-op instead of charging Solid for an extra empty scheduler drain.
    flush() {},
  };
  solidRoot((dispose) => {
    disposeRoot = dispose;
    instance = setup(api);
  });
  return { api, instance, dispose: () => disposeRoot() };
}

function vueSession(setup) {
  const scope = vueEffectScope(true);
  let instance;
  const api = {
    // @vue/reactivity intentionally exposes no public batch primitive. Cases
    // with several writes report the extra observable effect work instead of
    // silently reaching into Vue internals.
    capabilities: {
      publicBatch: false,
      reentrantEffectWrites: false,
      scheduledEffects: false,
    },
    signal(initial) {
      const cell = vueRef(initial);
      return {
        read: () => cell.value,
        write: (value) => {
          cell.value = value;
        },
      };
    },
    computed(fn) {
      const cell = vueComputed(fn);
      return { read: () => cell.value };
    },
    effect(fn) {
      const runner = vueEffect(() => {
        fn();
      });
      return () => vueStop(runner);
    },
    batch(fn) {
      return fn();
    },
    flush() {},
  };
  scope.run(() => {
    instance = setup(api);
  });
  return { api, instance, dispose: () => scope.stop() };
}

export function createSession(framework, setup) {
  assertFramework(framework);
  switch (framework) {
    case "reflex":
      return reflexSession(reflexCurrent, setup);
    case "reflex-e87bb66":
      return reflexSession(reflexE87bb66, setup);
    case "alien":
      return alienSession(setup);
    case "solid2":
      return solidSession(setup);
    case "vue":
      return vueSession(setup);
  }
}
