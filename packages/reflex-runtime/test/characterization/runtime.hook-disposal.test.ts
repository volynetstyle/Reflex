import { beforeEach, describe, expect, it } from "vitest";
import {
  configureRuntimeContext,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../src/internal";
import type { WatcherNode } from "../../src/kernel";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../runtime.test_utils";

/**
 * Characterization, outside the contract: watcher disposal from
 * `onNodeInvalidated`.
 *
 * DISPOSE.md forbids it, because push holds edge continuations and
 * `unlinkEdge` clears them. The development policy rejects it (the dev test
 * config does not run this file); production does not specify it. These tests pin what production does today so that a change
 * of the walk's continuation model is a visible decision, not an accident.
 *
 * Since 2026-10-24 the transitive phase of push reads the sibling edge before
 * the hook runs (snapshot continuation). Before, it read `edge.nextOut` after
 * the hook (live continuation). Neither model is safe here:
 *
 * | hook disposes   | live (before)              | snapshot (now)                        |
 * | --------------- | -------------------------- | ------------------------------------- |
 * | current watcher | later watchers not notified | all notified                         |
 * | next watcher    | disposed one skipped        | disposed one notified, later one lost |
 */
describe("Reactive runtime - watcher disposal from onNodeInvalidated (characterization, uncontracted)", () => {
  beforeEach(() => {
    resetRuntime();
  });

  /** producer -> computed -> three watchers; returns the notified indices. */
  function notifiedWhen(
    onNotify: (index: number, watchers: WatcherNode[]) => void,
  ): number[] {
    const notified: number[] = [];
    let watchers: WatcherNode[] = [];
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          const index = watchers.indexOf(node as WatcherNode);
          notified.push(index);
          onNotify(index, watchers);
        },
      },
    });

    const source = createProducer(1);
    const derived = createConsumer(() => readProducer(source) * 2);
    watchers = [0, 1, 2].map(() =>
      createWatcher(() => {
        readConsumer(derived);
      }),
    );
    for (const watcher of watchers) runWatcher(watcher);

    writeProducer(source, 2);
    return notified;
  }

  it("still notifies later watchers when the hook disposes the current one", () => {
    expect(
      notifiedWhen((index, watchers) => disposeWatcher(watchers[index]!)),
    ).toEqual([0, 1, 2]);
  });

  it("notifies an already disposed next watcher and loses the one after it", () => {
    expect(
      notifiedWhen((index, watchers) => {
        if (index + 1 < watchers.length) disposeWatcher(watchers[index + 1]!);
      }),
    ).toEqual([0, 1]);
  });
});
