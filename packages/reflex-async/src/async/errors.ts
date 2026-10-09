import type { AsyncSource } from "./types";

/**
 * A synchronous read could not produce a fresh value.
 * The promise wakes when the source changes.
 */
export class AsyncBlocker {
  constructor(
    readonly source: AsyncSource<unknown>,
    readonly promise: Promise<void>,
  ) {}
}

export class AsyncDisposedError extends Error {
  constructor() {
    super("The async derivation has been disposed.");
    this.name = "AsyncDisposedError";
  }
}

/** Programmer misuse of the execution protocol, distinct from async data failure. */
export class AsyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncProtocolError";
  }
}
