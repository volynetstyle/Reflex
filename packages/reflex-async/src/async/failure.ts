import { AsyncProtocolError } from "./errors";

const NO_FAILURE = Symbol("no async failure");

let activeFailureCapture: AsyncFailureCapture | undefined;


// Is it possible to merge this object with lifetime and remove class?
export class AsyncFailureCapture {
  private failure: unknown | typeof NO_FAILURE = NO_FAILURE;

  run<T>(expression: () => T): T {
    this.failure = NO_FAILURE;

    const parent = activeFailureCapture;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeFailureCapture = this;

    try {
      return expression();
    } finally {
      activeFailureCapture = parent;
    }
  }

  matches(error: unknown): boolean {
    return this.failure !== NO_FAILURE && Object.is(this.failure, error);
  }

  /** @internal */
  capture(error: unknown): void {
    this.failure = error;
  }
}

export function throwAsyncFailure(error: unknown): never {
  const capture = activeFailureCapture;

  if (capture !== undefined && !(error instanceof AsyncProtocolError)) {
    capture.capture(error);
  }

  throw error;
}
