import type { AsyncSource } from "./types";

/** A synchronous read could not produce a fresh value. The promise wakes on a source change. */
export class AsyncBlocker extends Error {
  constructor(
    readonly source: AsyncSource<unknown>,
    readonly promise: Promise<void>,
  ) {
    super("An async derivation has no fresh result yet.");
    this.name = "AsyncBlocker";
  }
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
