const DEFAULT_FRAME_SIZE = 16 as const;

interface IUnrolledStack<T = unknown> {
  push(value: T): void;
  pop(): T | undefined;
}

