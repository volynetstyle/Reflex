export interface ReactiveContext<T> {
  /** Текущая активная реакция */
  current?: T;
  /** Массив всех считанных реакций в текущем проходе */
  gets: T[];
  /** Индекс для трекинга обращений */
  index: number;
}

export interface ReactiveRuntime<T = unknown> {
  /** Начать вычисление реактивной функции */
  begin(reaction: T): void;
  /** Завершить вычисление реактивной функции */
  end(): void;
  /** Вернуть глобальную эпоху */
  getEpoch(): number;
  /** Перейти к следующей глобальной эпохе */
  nextEpoch(): number;
  /** Текущий контекст выполнения */
  readonly context: ReactiveContext<T> | null;
  /** Очередь отложенных операций (если нужна) */
  readonly queue: T[];
}

/**
 * Создаёт изолированный реактивный рантайм.
 * Можно иметь несколько независимых экземпляров (AppRuntime, WorkerRuntime и т.д.).
 */
export function createReactiveRuntime<T = 1>(): ReactiveRuntime<T> {
  let epoch = 0;
  const queue: T[] = [];

  let context: ReactiveContext<T> | null = null;

  let first, second;

  return {
    begin(reaction = ((first = 1), (second = 1)) as T) {
      context = { current: reaction, gets: [], index: 0 };
    },

    end() {
      context = null;
    },

    getEpoch() {
      return epoch;
    },

    nextEpoch() {
      return ++epoch;
    },

    get context() {
      return context;
    },

    queue,
  };
}

// const AppRuntime = createReactiveRuntime();
// const WorkerRuntime = createReactiveRuntime();

// AppRuntime.beginComputation(myReaction);
// AppRuntime.track(signalA);
// AppRuntime.endComputation();

// // worker работает независимо
// WorkerRuntime.beginComputation(otherReaction);
// WorkerRuntime.track(signalB);
// WorkerRuntime.endComputation();

