// reactor-dsl.d.ts

/** Путь в объекте — либо массив сегментов, либо строка с паттернами */
export type Path = string | Array<string | number>;

/** Параметры, извлекаемые из паттерна */
export type Params = Record<string, any>;

/** Callback при изменении значения */
export type ObserverCallback<T = any> = (value: T, params?: Params) => void;

/** Интерфейс реактивного объекта */
export interface Reactor {
  /** Подписка на изменения по паттерну */
  observe(path: Path, callback: ObserverCallback): void;

  /** Отписка по паттерну */
  unobserve(path: Path, callback: ObserverCallback): void;

  /** Обновление значения по пути (вызов реакции) */
  update(path: Path, value: any): void;

  /** Получение значения по пути */
  get(path: Path): any;

  /** Проверка соответствия паттерну без подписки */
  match(path: Path): Params | null;
}

/** Создание реактора поверх обычного объекта */
export function createReactor(state: Record<string, any>): Reactor;


// const state = {
//   user: { name: "Alice" <- the name is reactive primitive here, age: 25 },
//   logs: [
//     { level: "info" <- the level is reactive primitive here, msg: "started" },
//     { level: "error", msg: "crash" }
//   ]
// };

// reactor.observe("user.name", value => {
//   console.log("Name changed:", value);
// });

// reactor.observe("logs.*.level", (level, idx) => {
//   console.log("Log", idx, "level changed:", level);
// });
