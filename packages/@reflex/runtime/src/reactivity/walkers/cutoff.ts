const enum CutoffStrategy {
  StrictEqual = 0, // a === b        — найчастіший випадок
  Never = 1, // завжди dirty   — для side effects
  Custom = 2, // власна функція
}

interface Thunk<T> {
  cutoffStrategy: CutoffStrategy;
  cutoffFn?: (a: T, b: T) => boolean; // тільки якщо Custom
}

export function applyCutoff<T>(prev: T, next: T): boolean {
  return prev === next;
}
