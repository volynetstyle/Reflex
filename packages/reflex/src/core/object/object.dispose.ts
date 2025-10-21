interface IDisposable {
  [Symbol.dispose]: void;
}

interface IDisposableAsync {
  [Symbol.asyncDispose]: void;
}

export type { IDisposable, IDisposableAsync };
