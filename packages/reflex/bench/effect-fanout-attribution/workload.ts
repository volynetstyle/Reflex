import {
  batch,
  computed,
  createRuntime,
  effect,
  flush,
  signal,
} from "../../src";

export const EFFECT_FANOUT_WIDTHS = [1, 4, 8, 16, 32, 64, 128, 256] as const;

export type CallbackMode = "shared" | "closures";

export interface EffectFanoutOptions {
  width: number;
  bodyIterations?: number;
  callbackMode?: CallbackMode;
  prewarmQueueCapacity?: number;
}

export interface EffectFanoutCase {
  readonly width: number;
  readonly callbackMode: CallbackMode;
  readonly bodyIterations: number;
  step(): void;
  validate(expectedOperations: number): void;
  dispose(): void;
}

let attributionSink = 0;

function burn(value: number, iterations: number): number {
  let result = value | 0;
  for (let index = 0; index < iterations; index += 1) {
    result = (Math.imul(result ^ index, 1664525) + 1013904223) | 0;
  }
  return result;
}

function prewarmSchedulerQueue(capacity: number): void {
  if (capacity <= 0) return;

  const source = signal(0);
  const disposers = Array.from({ length: capacity }, () =>
    effect(() => {
      attributionSink ^= source();
    }),
  );

  batch(() => source.set(1));
  flush();

  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    disposers[index]!();
  }
}

export function createEffectFanoutCase({
  width,
  bodyIterations = 0,
  callbackMode = "closures",
  prewarmQueueCapacity = 0,
}: EffectFanoutOptions): EffectFanoutCase {
  createRuntime({ effectStrategy: "flush" });
  prewarmSchedulerQueue(prewarmQueueCapacity);

  const source = signal(0);
  const derived = computed(() => source() + 1);
  let value = 0;
  let callbackRuns = 0;

  const sharedCallback = (): void => {
    const next = burn(derived(), bodyIterations);
    callbackRuns += 1;
    attributionSink = (attributionSink + next) | 0;
  };

  const disposers = Array.from({ length: width }, (_, index) =>
    effect(
      callbackMode === "shared"
        ? sharedCallback
        : () => {
            const next = burn(derived() + index, bodyIterations);
            callbackRuns += 1;
            attributionSink = (attributionSink + next) | 0;
          },
    ),
  );
  const setupRuns = callbackRuns;

  return {
    width,
    callbackMode,
    bodyIterations,
    step() {
      batch(() => source.set(++value));
      flush();
    },
    validate(expectedOperations) {
      const expectedRuns = setupRuns + expectedOperations * width;
      if (callbackRuns !== expectedRuns) {
        throw new Error(
          `effect fanout width=${width}: expected ${expectedRuns} callback runs, received ${callbackRuns}`,
        );
      }
    },
    dispose() {
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        disposers[index]!();
      }
    },
  };
}

export function createSerialEffectCase(bodyIterations = 0): EffectFanoutCase {
  return createEffectFanoutCase({
    width: 1,
    bodyIterations,
    callbackMode: "shared",
  });
}

export function readEffectAttributionSink(): number {
  return attributionSink;
}
