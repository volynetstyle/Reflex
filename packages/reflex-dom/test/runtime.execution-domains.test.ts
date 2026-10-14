import { describe, expect, it, vi } from "vitest";
import {
  getActiveRuntimeContext,
  reactiveBatchDepth,
} from "@volynets/reflex-runtime/internal";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import {
  createRendererRuntime,
  type RuntimeInstance,
} from "../src/runtime/options";

const microtasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function createApp(name: string, effectStrategy: EffectStrategy) {
  const idle = vi.fn();
  const runtime = createRendererRuntime({
    effectStrategy,
    hooks: { onRuntimeIdle: idle },
  });
  const source = runtime.run(() => createProducer(0));
  const runs: Array<{ value: number; inOwnDomain: boolean }> = [];
  const watcher = runtime.run(() =>
    createWatcher(() => {
      runs.push({
        value: readProducer(source),
        inOwnDomain: getActiveRuntimeContext() === runtime.execution,
      });
    }),
  );
  runtime.run(() => runWatcher(watcher));
  const write = (value: number) =>
    runtime.batch(() => writeProducer(source, value));
  return { name, runtime, source, runs, idle, write };
}

function values(app: { runs: Array<{ value: number }> }) {
  return app.runs.map((run) => run.value);
}

describe("DOM runtimes as independent execution domains", () => {
  it.each<EffectStrategy>(["flush", "eager", "sab"])(
    "keeps two %s renderers' queues, hooks and flushes apart",
    async (strategy) => {
      const a = createApp("a", strategy);
      const b = createApp("b", strategy);

      for (let round = 1; round <= 3; round++) {
        a.write(round);
        b.write(round * 10);
        if (round === 2) await microtasks();
        b.write(round * 10 + 1);
        a.write(round + 100);
      }
      await microtasks();

      expect(values(a).at(-1)).toBe(103);
      expect(values(b).at(-1)).toBe(31);
      expect(values(a).every((value) => value < 10 || value > 100)).toBe(true);
      expect(values(b).every((value) => value === 0 || value >= 10)).toBe(true);
      for (const app of [a, b]) {
        expect(app.runs.every((run) => run.inOwnDomain)).toBe(true);
        expect(app.runtime.domain.hasPending()).toBe(false);
        expect(app.idle).toHaveBeenCalled();
      }
    },
  );

  it("does not leak a batch into another renderer", () => {
    const a = createApp("a", "flush");
    const b = createApp("b", "flush");
    let depthInB = -1;

    a.runtime.batch(() => {
      expect(reactiveBatchDepth).toBeGreaterThan(0);
      b.runtime.run(() => {
        depthInB = reactiveBatchDepth;
      });
    });

    expect(depthInB).toBe(0);
  });

  it("drops a closed renderer's pending microtask without touching the other", async () => {
    const a = createApp("a", "flush");
    const b = createApp("b", "flush");

    a.write(1);
    b.write(1);
    a.runtime.domain.close();
    await microtasks();

    expect(values(a)).toEqual([0]);
    expect(values(b)).toEqual([0, 1]);
    expect(() => a.runtime.batch(() => 0)).toThrow(/closed/);
    expect(() => a.runtime.flush()).not.toThrow();
  });

  it("exposes the same domain through every runtime entry point", () => {
    const runtime: RuntimeInstance = createRendererRuntime();

    expect(runtime.domain.context).toBe(runtime.execution);
    runtime.run(() => {
      expect(runtime.domain.depth).toBe(1);
    });
    runtime.batch(() => {
      expect(runtime.domain.depth).toBeGreaterThan(0);
    });
  });
});
