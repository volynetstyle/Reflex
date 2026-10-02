import { AsyncProtocolError } from "./errors";
import { EMPTY_FRONTIER, type FrontierSnapshot } from "./frontier";
import type { AsyncBlocker } from "./errors";
import type { AsyncAttempt, AsyncExecution } from "./types";

export class Attempt implements AsyncAttempt {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  frontier: FrontierSnapshot = EMPTY_FRONTIER;
  blocker: AsyncBlocker | undefined;
  // Cache one revision's notification; public reads promote it to a reusable blocker.
  readCache: Promise<void> | AsyncBlocker | undefined;

  constructor(
    readonly token: number,
    private readonly isCurrent: () => boolean,
  ) {}

  alive(): boolean {
    return !this.signal.aborted && this.isCurrent();
  }
}

let activeAsyncExecution: AsyncExecution | undefined;

/** This context controls handle lifetime only; dependency capture lives in frontier.ts. */
export function withAsyncExecution<T>(
  attempt: Attempt,
  body: (execution: AsyncExecution) => T,
): T {
  const checkLifetime = (): void => {
    if (activeAsyncExecution !== execution || !attempt.alive()) {
      throw new AsyncProtocolError(
        "Capture reactive async inputs before await; AsyncExecution.read/commit are synchronous.",
      );
    }
  };
  const execution: AsyncExecution = {
    signal: attempt.signal,
    attempt,
    read: (source) => {
      checkLifetime();
      return source.read();
    },
    commit: (source) => {
      checkLifetime();
      return source.commit();
    },
  };
  const parent = activeAsyncExecution;
  activeAsyncExecution = execution;
  try {
    return body(execution);
  } finally {
    activeAsyncExecution = parent;
  }
}
