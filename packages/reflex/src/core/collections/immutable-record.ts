/* eslint-disable @typescript-eslint/ban-types */

export const enum TypeTag {
  Undefined = 1 << 0,
  Null = 1 << 1,
  Boolean = 1 << 2,
  Number = 1 << 3,
  String = 1 << 4,
  Object = 1 << 5,
  Array = 1 << 6,
}

export type RecordSpec = Record<string, unknown>;

export interface RecordMeta {
  /** Маркер, что это именно Record */
  readonly __rr__: true;
  /** Локальная версия, растёт при update/fork/branch */
  __version: number;
  /** Эпоха (можно привязать к локальным epoch scheduler’а) */
  __epoch: number;
}

export type RecordInstance<T extends RecordSpec> = T & RecordMeta;

export interface RecordType<T extends RecordSpec> {
  /** Список полей, зафиксированный shape */
  readonly fields: readonly (keyof T)[];
  /** Дефолтные значения (immutable снапшот) */
  readonly defaults: Readonly<T>;
  /** Можно ли мутировать инстансы через update() */
  readonly mutable: boolean;

  /** Создать новый инстанс */
  create(data?: Partial<T>, epoch?: number): RecordInstance<T>;

  /** Проверка, что значение — инстанс именно этого типа */
  is(value: unknown): value is RecordInstance<T>;

  /** Мутация in-place (только для mutable) */
  update(
    instance: RecordInstance<T>,
    updates: Partial<T>,
    epoch?: number,
  ): RecordInstance<T>;

  /** Полная копия с обновлениями (copy-on-write) */
  fork(
    instance: RecordInstance<T>,
    updates: Partial<T>,
    epoch?: number,
  ): RecordInstance<T>;

  /**
   * Прототипное ветвление.
   * Создаёт новый объект, где parent — instance, а updates — own props.
   */
  branch(
    instance: RecordInstance<T>,
    updates: Partial<T>,
    epoch?: number,
  ): RecordInstance<T>;
}

type TypeMap<T extends RecordSpec> = {
  [K in keyof T]: TypeTag;
};

let GLOBAL_VERSION = 0;

function detectTypeTag(value: unknown): TypeTag {
  if (Array.isArray(value)) return TypeTag.Array;
  if (value === null) return TypeTag.Null;
  switch (typeof value) {
    case "undefined":
      return TypeTag.Undefined;
    case "boolean":
      return TypeTag.Boolean;
    case "number":
      return TypeTag.Number;
    case "string":
      return TypeTag.String;
    case "object":
      return TypeTag.Object;
    default:
      // Для функций / symbol / bigint — считаем как Object,
      // если нужно можно расширить.
      return TypeTag.Object;
  }
}

function sameTypeTag(expected: TypeTag, actual: TypeTag): boolean {
  return expected === actual;
}

function validateUpdates<T extends RecordSpec>(
  instance: RecordInstance<T>,
  updates: Partial<T>,
  types: TypeMap<T>,
): void {
  for (const key of Object.keys(updates) as (keyof T)[]) {
    if (!Reflect.has(instance, key)) continue;
    const expectedTag = types[key];
    const next = updates[key];
    const actualTag = detectTypeTag(next);

    if (!sameTypeTag(expectedTag, actualTag)) {
      throw new TypeError(
        `Invalid type for "${String(key)}": expected ${expectedTag}, got ${actualTag}`,
      );
    }
  }
}

/**
 * Базовая фабрика Record-типа.
 *
 * Пример:
 *   const User = createRecord({
 *     id: 0,
 *     name: "",
 *     roles: [] as string[],
 *   }, { mutable: false });
 */
export function createRecord<T extends RecordSpec>(
  defaults: T,
  options?: { mutable?: boolean },
): RecordType<T> {
  const mutable = options?.mutable ?? false;

  const fields = Object.freeze(Object.keys(defaults)) as (keyof T)[];
  const defaultValues: T = Object.freeze({ ...defaults }) as T;

  // Предрассчитанные типы полей — без per-instance рассчёта
  const typeMap: TypeMap<T> = {} as TypeMap<T>;
  for (const key of fields) {
    typeMap[key] = detectTypeTag(defaultValues[key]);
  }

  function makeInstance(
    data: Partial<T> | undefined,
    epoch: number | undefined,
  ): RecordInstance<T> {
    const obj = Object.create(null) as T & RecordMeta;

    for (const key of fields) {
      const base = defaultValues[key];
      const value = (data && key in data ? data[key] : base) as T[typeof key];

      const expectedTag = typeMap[key];
      const actualTag = detectTypeTag(value);
      if (!sameTypeTag(expectedTag, actualTag)) {
        throw new TypeError(
          `Invalid type for "${String(key)}": expected ${expectedTag}, got ${actualTag}`,
        );
      }

      (obj as any)[key] = value;
    }

    Object.defineProperty(obj, "__rr__", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    Object.defineProperty(obj, "__version", {
      value: ++GLOBAL_VERSION,
      enumerable: false,
      writable: true,
      configurable: false,
    });

    Object.defineProperty(obj, "__epoch", {
      value: epoch ?? 0,
      enumerable: false,
      writable: true,
      configurable: false,
    });

    return (
      mutable ? Object.seal(obj) : Object.freeze(obj)
    ) as RecordInstance<T>;
  }

  const Type: RecordType<T> = {
    fields,
    defaults: defaultValues,
    mutable,

    create(data?: Partial<T>, epoch?: number) {
      return makeInstance(data, epoch);
    },

    is(value: unknown): value is RecordInstance<T> {
      if (!value || typeof value !== "object") return false;
      const v = value as any;
      if (v.__rr__ !== true) return false;

      for (const key of fields) {
        if (!Reflect.has(v, key)) return false;
      }
      return true;
    },

    update(
      instance: RecordInstance<T>,
      updates: Partial<T>,
      epoch?: number,
    ): RecordInstance<T> {
      if (!this.mutable) {
        throw new Error("Cannot mutate immutable Record");
      }

      validateUpdates(instance, updates, typeMap);

      for (const key of Object.keys(updates) as (keyof T)[]) {
        if (Reflect.has(instance, key)) {
          (instance as any)[key] = updates[key];
        }
      }

      instance.__version = ++GLOBAL_VERSION;
      if (epoch != null) instance.__epoch = epoch;

      return instance;
    },

    fork(
      instance: RecordInstance<T>,
      updates: Partial<T>,
      epoch?: number,
    ): RecordInstance<T> {
      validateUpdates(instance, updates, typeMap);

      const obj = Object.create(null) as T & RecordMeta;

      for (const key of fields) {
        const base = instance[key];
        const next = Reflect.has(updates, key) ? (updates as any)[key] : base;
        (obj as any)[key] = next;
      }

      Object.defineProperty(obj, "__rr__", {
        value: true,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      Object.defineProperty(obj, "__version", {
        value: ++GLOBAL_VERSION,
        enumerable: false,
        writable: true,
        configurable: false,
      });

      Object.defineProperty(obj, "__epoch", {
        value: epoch ?? instance.__epoch,
        enumerable: false,
        writable: true,
        configurable: false,
      });

      return (
        this.mutable ? Object.seal(obj) : Object.freeze(obj)
      ) as RecordInstance<T>;
    },

    branch(
      instance: RecordInstance<T>,
      updates: Partial<T>,
      epoch?: number,
    ): RecordInstance<T> {
      validateUpdates(instance, updates, typeMap);

      const obj = Object.create(instance) as T & RecordMeta;

      for (const key of Object.keys(updates) as (keyof T)[]) {
        Object.defineProperty(obj, key, {
          value: updates[key],
          writable: this.mutable,
          configurable: true,
          enumerable: true,
        });
      }

      Object.defineProperty(obj, "__rr__", {
        value: true,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      Object.defineProperty(obj, "__version", {
        value: ++GLOBAL_VERSION,
        enumerable: false,
        writable: true,
        configurable: false,
      });

      Object.defineProperty(obj, "__epoch", {
        value: epoch ?? instance.__epoch,
        enumerable: false,
        writable: true,
        configurable: false,
      });

      return (
        this.mutable ? Object.seal(obj) : Object.freeze(obj)
      ) as RecordInstance<T>;
    },
  };

  return Type;
}
