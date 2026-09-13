import {
  batch,
  computed,
  createRuntime,
  effect,
  signal,
} from "../../../../packages/reflex/src/index.js";
import {
  createRuntimeProfileSession,
  type RuntimeProfileCounters,
  type RuntimeProfileTopology,
} from "../../../../packages/reflex-runtime/src/profiling.js";
import type { ReactiveBenchApi } from "../types.js";

let session: ReturnType<typeof createRuntimeProfileSession> | undefined;

export function createInstrumentedReflexApi(): ReactiveBenchApi {
  const runtime = createRuntime({ effectStrategy: "eager" });
  const disposers: Array<() => void> = [];
  return {
    signal<T>(initial: T) {
      const value = signal(initial);
      return {
        read: value,
        write: (next: T) => void (value.set as (input: T) => unknown)(next),
      };
    },
    computed<T>(fn: () => T) {
      return { read: computed(fn) };
    },
    effect(fn) {
      const stop = effect(fn);
      disposers.push(stop);
      return stop;
    },
    batch,
    flush: runtime.flush,
    dispose() {
      for (let index = disposers.length - 1; index >= 0; index--) disposers[index]!();
      disposers.length = 0;
    },
  };
}

export function resetInstrumentation(): void {
  session?.stop();
  session = createRuntimeProfileSession({ reset: true, enabled: true });
}

export function readInstrumentation(): {
  counters: RuntimeProfileCounters;
  topology: RuntimeProfileTopology;
} {
  if (session === undefined) throw new Error("Instrumentation was not reset");
  return { counters: session.delta(), topology: session.readTopology() };
}
