interface IDisposable {
  dispose(): void;
  [Symbol.dispose]: void;
}

interface IDisposableAsync {
  disposeAsync(): Async<void>;
  [Symbol.asyncDispose]: void;
}

export type { IDisposable, IDisposableAsync };
