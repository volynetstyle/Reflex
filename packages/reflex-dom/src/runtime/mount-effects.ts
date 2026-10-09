/**
 * FIFO queue contract for first runs of `useMountedEffect`. This is a renderer
 * mount boundary, not a browser layout or paint phase.
 *
 * @remarks
 * **When to use:** to type an integration that schedules and flushes deferred
 * mount effects.
 * **When not to use:** as a general job scheduler or a guarantee that the
 * browser has painted a frame.
 */
export interface MountEffects {
  /** Enqueue an effect and return a function that cancels it before it runs. */
  schedule(task: () => void): () => void;
  /** Drain runnable effects in FIFO order, optionally stopping when `canRun` is false. */
  flush(canRun?: () => boolean): void;
}

export function createMountEffects(
  run: (task: () => void) => void = (task) => task(),
): MountEffects {
  const tasks: Array<{ run: (() => void) | null } | undefined> = [];
  let head = 0;
  let flushing = false;

  return {
    schedule(run) {
      const task = { run: run as (() => void) | null };
      tasks.push(task);
      // Cancellation also works after a flush starts, until this task runs.
      return () => {
        task.run = null;
      };
    },
    flush(canRun = () => true) {
      if (flushing) return;
      flushing = true;
      let failed = false;
      let firstError: unknown;
      try {
        while (head < tasks.length && canRun()) {
          const task = tasks[head]!;
          tasks[head++] = undefined;
          const callback = task.run;
          task.run = null;
          if (callback === null) continue;
          try {
            run(callback);
          } catch (error) {
            if (!failed) firstError = error;
            failed = true;
          }
        }
      } finally {
        if (head === tasks.length) {
          tasks.length = 0;
          head = 0;
        }
        flushing = false;
      }
      if (failed) throw firstError;
    },
  };
}
