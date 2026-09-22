import { describe, expect, it, vi } from "vitest";
import {
  Changed,
  WatcherCleanupPending,
  createWatcher,
  disposeWatcher,
  runWatcher,
} from "../../runtime.test_utils";

describe("watcher cleanup ownership", () => {
  it("keeps the no-cleanup path payload-free and tracks cleanup ownership", () => {
    const cleanup = vi.fn();
    let returnCleanup = true;
    const watcher = createWatcher(() => (returnCleanup ? cleanup : undefined));

    runWatcher(watcher);
    expect(watcher.state & WatcherCleanupPending).toBe(WatcherCleanupPending);
    expect(watcher.payload).toBe(cleanup);

    returnCleanup = false;
    watcher.state |= Changed;
    runWatcher(watcher);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(watcher.state & WatcherCleanupPending).toBe(0);
    expect(watcher.payload).toBeUndefined();

    watcher.state |= Changed;
    runWatcher(watcher);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(watcher.state & WatcherCleanupPending).toBe(0);
    expect(watcher.payload).toBeUndefined();

    returnCleanup = true;
    watcher.state |= Changed;
    runWatcher(watcher);
    disposeWatcher(watcher);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(watcher.state & WatcherCleanupPending).toBe(0);
    expect(watcher.payload).toBeUndefined();
  });
});
