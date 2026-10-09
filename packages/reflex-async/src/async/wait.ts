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

    // Settlement means the attempt changed.
    // The next read decides whether that means value, pending, or error.
    void promise.then(onChange, onChange);
  });
}