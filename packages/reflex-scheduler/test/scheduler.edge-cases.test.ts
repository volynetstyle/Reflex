import { describe, expect, it } from "vitest";
import {
  Changed,
  Scheduled,
  createWatcher,
  runWatcher,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import {
  Batching,
  Idle,
  createEagerScheduler,
  createFlushScheduler,
  createSabScheduler,
  type EffectScheduler,
} from "../src";

function enqueueChanged(scheduler: EffectScheduler, node: WatcherNode): void {
  node.state |= Changed;
  scheduler.enqueue(node);
}

describe("scheduler re-entrant edge cases", () => {
  it("claims queue membership once across duplicate enqueue attempts", () => {
    const scheduler = createFlushScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    enqueueChanged(scheduler, node);
    scheduler.enqueue(node);
    scheduler.flush();

    expect(runs).toBe(1);
    expect(node.state & Scheduled).toBe(0);
  });

  it("does not release queue membership during a direct watcher run", () => {
    const scheduler = createFlushScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    enqueueChanged(scheduler, node);
    runWatcher(node);

    expect(runs).toBe(1);
    expect(node.state & Scheduled).toBe(Scheduled);

    scheduler.flush();

    expect(runs).toBe(1);
    expect(node.state & Scheduled).toBe(0);
  });

  it("keeps draining in FIFO order when enqueue grows the ring during flush", () => {
    const scheduler = createFlushScheduler();
    const order: number[] = [];
    const appended = [16, 17].map((value) =>
      createWatcher(() => order.push(value)),
    );
    const initial = Array.from({ length: 16 }, (_, value) =>
      createWatcher(() => {
        order.push(value);
        if (value === 0) {
          enqueueChanged(scheduler, appended[0]!);
          enqueueChanged(scheduler, appended[1]!);
        }
      }),
    );

    for (const node of initial) enqueueChanged(scheduler, node);
    scheduler.flush();

    expect(order).toEqual(Array.from({ length: 18 }, (_, index) => index));
    expect(scheduler.core.queue.head).toBe(scheduler.core.queue.tail);
    for (const node of [...initial, ...appended]) {
      expect(node.state & Scheduled).toBe(0);
    }
  });

  it("cancels the remaining drain when reset is called from a watcher", () => {
    const scheduler = createFlushScheduler();
    const order: string[] = [];
    const replacement = createWatcher(() => order.push("replacement"));
    const first = createWatcher(() => {
      order.push("first");
      scheduler.reset();
      enqueueChanged(scheduler, replacement);
    });
    const second = createWatcher(() => order.push("second"));

    enqueueChanged(scheduler, first);
    enqueueChanged(scheduler, second);
    scheduler.flush();

    expect(order).toEqual(["first", "replacement"]);
    expect(second.state & Scheduled).toBe(0);
    expect(scheduler.core.phase).toBe(Idle);
    expect(scheduler.core.batchDepth).toBe(0);

    enqueueChanged(scheduler, second);
    scheduler.flush();
    expect(order).toEqual(["first", "replacement", "second"]);
  });

  describe.each([
    ["flush", createFlushScheduler],
    ["eager", createEagerScheduler],
    ["SAB", createSabScheduler],
  ] as const)("%s policy", (_name, createScheduler) => {
    it("preserves nested active boundaries when reset is called inside batch", () => {
      const scheduler = createScheduler();
      const node = createWatcher(() => undefined);

      scheduler.batch(() => {
        scheduler.batch(() => {
          enqueueChanged(scheduler, node);
          scheduler.reset();
          expect(scheduler.core.phase).toBe(Batching);
          expect(scheduler.core.batchDepth).toBe(2);
          expect(node.state & Scheduled).toBe(0);
        });

        expect(scheduler.core.phase).toBe(Batching);
        expect(scheduler.core.batchDepth).toBe(1);
      });

      expect(scheduler.core.phase).toBe(Idle);
      expect(scheduler.core.batchDepth).toBe(0);
    });
  });

  it("continues after watcher errors and rethrows the first error", () => {
    const scheduler = createFlushScheduler();
    const firstError = new Error("first");
    const order: string[] = [];
    const nodes = [
      createWatcher(() => {
        order.push("first");
        throw firstError;
      }),
      createWatcher(() => {
        order.push("second");
        throw new Error("second");
      }),
      createWatcher(() => order.push("third")),
    ];

    for (const node of nodes) enqueueChanged(scheduler, node);

    expect(() => scheduler.flush()).toThrow(firstError);
    expect(order).toEqual(["first", "second", "third"]);
    expect(scheduler.core.phase).toBe(Idle);
    expect(scheduler.core.queue.head).toBe(scheduler.core.queue.tail);
  });
});
