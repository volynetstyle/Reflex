import type { ReactiveBenchApi } from "./types.js";
import { getWorkload } from "./workloads/index.js";

interface Request {
  framework: "alien" | "reflex";
  workloadId: string;
  size: number;
  policy: "eager" | "batch";
  warmup: number;
  iterations: number;
}

interface AlienModule {
  signal<T>(initial: T): { (): T; (value: T): void };
  computed<T>(fn: () => T): () => T;
  effect(fn: () => void): () => void;
  startBatch(): void;
  endBatch(): void;
  instrumentation: Record<string, number>;
  resetInstrumentation(): void;
}

async function alienApi(): Promise<{
  api: ReactiveBenchApi;
  reset(): void;
  read(): unknown;
}> {
  const modulePath = "../instrumented/alien.mjs";
  const alien = (await import(modulePath)) as AlienModule;
  const disposers: Array<() => void> = [];
  return {
    api: {
      signal<T>(initial: T) {
        const value = alien.signal(initial);
        return { read: value, write: value };
      },
      computed<T>(fn: () => T) {
        return { read: alien.computed(fn) };
      },
      effect(fn) {
        const stop = alien.effect(fn);
        disposers.push(stop);
        return stop;
      },
      batch<T>(fn: () => T): T {
        alien.startBatch();
        try { return fn(); } finally { alien.endBatch(); }
      },
      flush() {},
      dispose() {
        for (let index = disposers.length - 1; index >= 0; index--) disposers[index]!();
      },
    },
    reset: alien.resetInstrumentation,
    read: () => ({ ...alien.instrumentation }),
  };
}

async function reflexApi(): Promise<{
  api: ReactiveBenchApi;
  reset(): void;
  read(): unknown;
}> {
  const modulePath = "../instrumented/reflex.mjs";
  const reflex = await import(modulePath) as {
    createInstrumentedReflexApi(): ReactiveBenchApi;
    resetInstrumentation(): void;
    readInstrumentation(): unknown;
  };
  return {
    api: reflex.createInstrumentedReflexApi(),
    reset: reflex.resetInstrumentation,
    read: reflex.readInstrumentation,
  };
}

async function main(): Promise<void> {
  const request = JSON.parse(process.argv[2] ?? "") as Request;
  const instrumented = request.framework === "alien" ? await alienApi() : await reflexApi();
  const workload = getWorkload(request.workloadId);
  const instance = workload.setup(instrumented.api, request.size, request.policy);
  for (let index = 0; index < request.warmup; index++) instance.run();
  instrumented.reset();
  const before = instance.counters();
  for (let index = 0; index < request.iterations; index++) instance.run();
  const after = instance.counters();
  const observable = {
    computedRuns: after.computedRuns - before.computedRuns,
    effectRuns: after.effectRuns - before.effectRuns,
    signalWrites: after.signalWrites - before.signalWrites,
    checksum: after.checksum,
  };
  process.stdout.write(`${JSON.stringify({ ...request, processId: process.pid, observable, mechanism: instrumented.read() })}\n`);
  instance.dispose();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
