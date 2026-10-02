import { AsyncProtocolError } from "./errors";

/** Internal control value: only AsyncSource failures may commit an error evaluation. */
export class AsyncFailure {
  constructor(readonly error: unknown) {}
}

interface FailureCaptureState {
  failure?: AsyncFailure;
}

let activeFailureCapture: FailureCaptureState | undefined;

export class AsyncFailureCapture {
  private readonly state: FailureCaptureState = {};

  run<T>(expression: () => T): T {
    const parent = activeFailureCapture;
    activeFailureCapture = this.state;
    try {
      return expression();
    } finally {
      activeFailureCapture = parent;
    }
  }

  matches(error: unknown): boolean {
    return (
      this.state.failure !== undefined &&
      Object.is(this.state.failure.error, error)
    );
  }
}

export function throwAsyncFailure(error: unknown): never {
  // User catch blocks must observe the original error, including primitives.
  if (
    activeFailureCapture !== undefined &&
    !(error instanceof AsyncProtocolError)
  )
    activeFailureCapture.failure = new AsyncFailure(error);
  throw error;
}
