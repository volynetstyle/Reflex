import { AsyncProtocolError, type AsyncBlocker } from "./errors";
import {
  EMPTY_FRONTIER,
  materializeFrontier,
  type EvaluationFrontier,
  type PublicationFrontier,
} from "./frontier";
import type {
  AsyncAttempt,
  AsyncCommit,
  AsyncExecution,
  AsyncSource,
} from "./types";

export class Attempt implements AsyncAttempt {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;

  frontier: EvaluationFrontier = EMPTY_FRONTIER;

  private materializedFrontier: PublicationFrontier | undefined;

  blocker: AsyncBlocker | undefined;

  // Cache one revision's notification; public reads promote it to a reusable blocker.
  readCache: Promise<void> | AsyncBlocker | undefined;

  constructor(
    readonly token: number,
    // PERF IDEA: each Attempt captures a fresh `isCurrent` closure.
    // If this becomes significant, consider replacing it with `owner + token`
    // and checking the current token directly if this becomes measurable not by taste.
    private readonly isCurrent: () => boolean,
  ) {}

  alive(): boolean {
    return !this.signal.aborted && this.isCurrent();
  }

  publicationFrontier(): PublicationFrontier {
    // Publication state belongs to this attempt, including every blocked retry.
    return (this.materializedFrontier ??= materializeFrontier(this.frontier));
  }

  cachedPublicationFrontier(): PublicationFrontier | undefined {
    return this.materializedFrontier;
  }

  releaseEvaluationFrontier(): void {
    this.frontier = EMPTY_FRONTIER;
  }
}

interface ExecutionHandle extends AsyncExecution {
  readonly attempt: Attempt;
}

let activeAsyncExecution: ExecutionHandle | undefined;

const PROTO_MESSAGE =
  "Capture reactive async inputs before await; AsyncExecution.read/commit are synchronous.";

/** This context controls handle lifetime only; dependency capture lives in frontier.ts. */
function executionRead<T>(this: ExecutionHandle, source: AsyncSource<T>): T {
  if (activeAsyncExecution !== this || !this.attempt.alive()) {
    throw new AsyncProtocolError(PROTO_MESSAGE);
  }

  return source.read();
}

function executionCommit<T>(
  this: ExecutionHandle,
  source: AsyncSource<T>,
): AsyncCommit<T> | undefined {
  if (activeAsyncExecution !== this || !this.attempt.alive()) {
    throw new AsyncProtocolError(PROTO_MESSAGE);
  }

  return source.commit();
}

export function withAsyncExecution<T>(
  attempt: Attempt,
  body: (execution: AsyncExecution) => T,
): T {
  const parent = activeAsyncExecution;

  const execution: ExecutionHandle = {
    signal: attempt.signal,
    attempt,
    read: executionRead,
    commit: executionCommit,
  };

  activeAsyncExecution = execution;

  try {
    return body(execution);
  } finally {
    activeAsyncExecution = parent;
  }
}
