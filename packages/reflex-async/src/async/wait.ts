// One reaction per pending notification. Aborted waiters leave this set, so a
// never-settling promise retains neither their signal nor their continuations.
const subscriptions = new WeakMap<Promise<void>, Set<() => void>>();

function subscribe(promise: Promise<void>, onChange: () => void): Set<() => void> {
  let listeners = subscriptions.get(promise);
  if (listeners === undefined) {
    listeners = new Set();
    subscriptions.set(promise, listeners);
    const pending = listeners;
    const notify = (): void => {
      subscriptions.delete(promise);
      for (const listener of pending) listener();
      pending.clear();
    };
    // A rejection also means change; the next read determines the outcome.
    void promise.then(notify, notify);
  }
  listeners.add(onChange);
  return listeners;
}

export function waitForChange(
  promise: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) return promise;

  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
      listeners.delete(onChange);
    };

    const onAbort = (): void => {
      cleanup();
      reject(signal.reason);
    };

    const onChange = (): void => {
      cleanup();
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
    const listeners = subscribe(promise, onChange);
  });
}
