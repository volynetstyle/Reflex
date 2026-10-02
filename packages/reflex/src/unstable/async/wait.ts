export function waitForChange(
  promise: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) return promise;
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
}
