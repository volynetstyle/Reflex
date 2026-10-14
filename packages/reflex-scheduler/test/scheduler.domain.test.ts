import { describe, expect, it } from "vitest";
import {
  Scheduled,
  createProducer,
  createWatcher,
  getActiveRuntimeContext,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import { createSchedulerDomain, type EffectStrategy } from "../src";

function createApp(effectStrategy: EffectStrategy) {
  const { domain, scheduler } = createSchedulerDomain({ effectStrategy });
  const source = createProducer(0);
  const runs: Array<{ value: number; own: boolean }> = [];
  const watcher = createWatcher(() => {
    runs.push({
      value: readProducer(source),
      own: getActiveRuntimeContext() === domain.context,
    });
  });
  domain.run(() => runWatcher(watcher));
  return { domain, scheduler, source, runs, watcher };
}

describe("scheduler domains", () => {
  it.each<EffectStrategy>(["eager", "sab", "flush"])(
    "binds one %s scheduler to one domain",
    (strategy) => {
      const a = createApp(strategy);
      const b = createApp(strategy);

      a.domain.batch(() => writeProducer(a.source, 1));
      expect(b.scheduler.hasPending()).toBe(false);
      b.domain.batch(() => writeProducer(b.source, 2));

      a.domain.flush();
      b.domain.flush();

      expect(a.runs.map((run) => run.value)).toEqual([0, 1]);
      expect(b.runs.map((run) => run.value)).toEqual([0, 2]);
      expect([...a.runs, ...b.runs].every((run) => run.own)).toBe(true);
    },
  );

  it("releases queued watchers when the domain closes", () => {
    const app = createApp("flush");

    app.domain.run(() => writeProducer(app.source, 1));
    expect(app.scheduler.hasPending()).toBe(true);
    expect(app.watcher.state & Scheduled).not.toBe(0);

    app.domain.close();

    expect(app.scheduler.hasPending()).toBe(false);
    expect(app.watcher.state & Scheduled).toBe(0);
    expect(app.domain.hasPending()).toBe(false);
  });
});
