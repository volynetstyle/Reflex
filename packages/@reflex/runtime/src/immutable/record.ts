/// That`s implementation under question therefore i`m not sure about real cause to use this in current implementation
/// maybe there is exist another way and some different representation of object through math 

// value = {
//   literal_A: {
//     some_a: 1,
//     some_b: 2,
//     some_c: [1, 2, 3]
//   }
// }

"use strict";

type Primitive = string | number | boolean | null;

interface RecordInstance {
  readonly hashCode: number;
}

interface RecordClass {
  readonly __kind: symbol;
  equals(a: unknown, b: unknown): boolean;
}

type ValidValue = Primitive | RecordInstance;
type FieldsOf<T> = ReadonlyArray<keyof T>;
type ComputedFn<T, V> = (instance: T) => V;

const ENABLE_FREEZE = false;

export class RecordFactory {
  private static readonly TYPE_MARK = Symbol("RecordType");
  private static nextTypeId = 1;

  // Кеш для Object.keys() щоб не викликати багато разів
  private static readonly keysCache = new WeakMap<
    object,
    ReadonlyArray<string>
  >();

  static define<T extends Record<string, ValidValue>>(
    defaults: T,
  ): RecordConstructor<T>;

  static define<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown>,
  >(
    defaults: T,
    computed: { [K in keyof C]: ComputedFn<Readonly<T>, C[K]> },
  ): RecordConstructor<T, C>;

  static define<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown> = Record<string, never>,
  >(
    defaults: T,
    computed?: { [K in keyof C]: ComputedFn<Readonly<T>, C[K]> },
  ): RecordConstructor<T, C> {
    return RecordFactory.build(defaults, computed ?? ({} as never));
  }

  private static build<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown>,
  >(
    defaults: T,
    computed: { [K in keyof C]: ComputedFn<Readonly<T>, C[K]> },
  ): RecordConstructor<T, C> {
    const fields = RecordFactory.getCachedKeys(defaults);
    const computedKeys = RecordFactory.getCachedKeys(computed);

    const defaultValues: T = Object.create(null);
    for (const k of fields) {
      defaultValues[k] = defaults[k];
    }

    const TYPE_ID = RecordFactory.nextTypeId++;

    class Struct {
      static readonly fields = fields;
      static readonly defaults = defaultValues;
      static readonly typeId = TYPE_ID;
      static readonly __kind = RecordFactory.TYPE_MARK;

      #hash: number | undefined;
      #cache: Partial<C> = Object.create(null);

      constructor(data: T) {
        for (const key of fields) {
          (this as Record<string, unknown>)[key as string] = data[key];
        }

        for (const key of computedKeys) {
          Object.defineProperty(this, key, {
            enumerable: true,
            configurable: false,
            get: (): C[typeof key] => {
              if (key in this.#cache) {
                return this.#cache[key]!;
              }
              const value = computed[key](this as unknown as Readonly<T>);
              this.#cache[key] = value;
              return value;
            },
          });
        }

        // Freeze тільки в development для безпеки
        if (ENABLE_FREEZE) {
          Object.freeze(this);
        } else {
          Object.seal(this); // Легший варіант для production
        }
      }

      get hashCode(): number {
        if (this.#hash !== undefined) return this.#hash;

        let h = TYPE_ID | 0;

        for (const key of fields) {
          const value = (this as Record<string, unknown>)[key as string];
          h =
            (Math.imul(31, h) + RecordFactory.hashValue(value as ValidValue)) |
            0;
        }

        return (this.#hash = h);
      }

      static create(data?: Partial<T>): Readonly<T & C> & RecordInstance {
        // Fast path: якщо немає даних або порожній об'єкт, використовуємо defaults
        if (!data) {
          return new Struct(defaultValues) as unknown as Readonly<T & C> &
            RecordInstance;
        }

        const keys = Object.keys(data);
        if (keys.length === 0) {
          return new Struct(defaultValues) as unknown as Readonly<T & C> &
            RecordInstance;
        }

        const prepared: T = Object.create(null);

        // Спочатку копіюємо всі defaults
        for (const key of fields) {
          prepared[key] = defaultValues[key];
        }

        // Потім перезаписуємо тільки змінені поля + валідація
        for (const key of keys as Array<keyof T>) {
          const value = data[key]!;

          if (!RecordFactory.validate(defaultValues[key], value)) {
            throw new TypeError(`Invalid value for field "${String(key)}"`);
          }

          prepared[key] = value;
        }

        return new Struct(prepared) as unknown as Readonly<T & C> &
          RecordInstance;
      }

      static equals(a: unknown, b: unknown): boolean {
        // Fast paths
        if (a === b) return true;
        if (!a || !b) return false;
        if (typeof a !== "object" || typeof b !== "object") return false;

        const recA = a as Record<string, unknown> & RecordInstance;
        const recB = b as Record<string, unknown> & RecordInstance;

        if (recA.constructor !== recB.constructor) return false;

        const hashA = recA.hashCode;
        const hashB = recB.hashCode;

        if (hashA !== hashB) return false;

        // Перевіряємо всі поля (потрібно через можливі колізії хешів)
        for (const key of fields) {
          const va = recA[key as string];
          const vb = recB[key as string];

          if (va === vb) continue;

          // Fast path для примітивів
          const typeA = typeof va;
          const typeB = typeof vb;

          if (typeA !== "object" || typeB !== "object") {
            return false;
          }

          // Перевіряємо вкладені Records
          if (
            va !== null &&
            typeof va === "object" &&
            "constructor" in (va as object) &&
            typeof (va as any).constructor === "function"
          ) {
            const ctor = (va as any).constructor as unknown as RecordClass;
            if ("equals" in ctor && typeof ctor.equals === "function") {
              if (!ctor.equals(va, vb)) return false;
              continue;
            }
          }

          return false;
        }

        return true;
      }
    }

    return Struct as unknown as RecordConstructor<T, C>;
  }

  /* ───────────── helpers ───────────── */

  private static getCachedKeys<T>(obj: T): ReadonlyArray<keyof T> {
    let keys = RecordFactory.keysCache.get(obj as object);
    if (!keys) {
      keys = Object.freeze(Object.keys(obj as object));
      RecordFactory.keysCache.set(obj as object, keys);
    }
    return keys as ReadonlyArray<keyof T>;
  }

  // FNV-1a hash - краще розподіл, менше колізій
  private static hashValue(v: ValidValue): number {
    if (v === null) return 0;

    if (typeof v === "object" && "hashCode" in v) {
      const ctor = v.constructor;
      if (
        typeof ctor === "function" &&
        "__kind" in ctor &&
        ctor.__kind === RecordFactory.TYPE_MARK
      ) {
        return v.hashCode;
      }
    }

    switch (typeof v) {
      case "number":
        return Object.is(v, -0) ? 0 : v | 0;

      case "string": {
        // FNV-1a hash algorithm (набагато краще розподіл)
        let h = 2166136261; // FNV offset basis
        for (let i = 0; i < v.length; i++) {
          h ^= v.charCodeAt(i);
          h = Math.imul(h, 16777619); // FNV prime
        }
        return h | 0;
      }

      case "boolean":
        return v ? 1 : 2;

      default:
        throw new TypeError("Invalid value inside Record");
    }
  }

  private static validate(base: ValidValue, value: ValidValue): boolean {
    if (base === null) return value === null;

    if (typeof base === "object" && "constructor" in base) {
      const baseCtor = base.constructor;
      if (
        typeof baseCtor === "function" &&
        "__kind" in baseCtor &&
        baseCtor.__kind === RecordFactory.TYPE_MARK
      ) {
        return (
          typeof value === "object" &&
          value !== null &&
          value.constructor === base.constructor
        );
      }
    }

    return typeof base === typeof value;
  }

  /* ───────────── persistent update ───────────── */

  static fork<T extends Record<string, ValidValue>>(
    instance: RecordInstance & Record<string, unknown>,
    updates: Partial<T>,
  ): RecordInstance & Record<string, unknown> {
    // Fast path: якщо немає оновлень, повертаємо той самий об'єкт
    if (!updates) {
      return instance;
    }

    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      return instance;
    }

    // Перевіряємо чи є реальні зміни
    let hasChanges = false;
    for (const key of updateKeys) {
      if (instance[key] !== updates[key as keyof T]) {
        hasChanges = true;
        break;
      }
    }

    // Якщо всі значення однакові, повертаємо original
    if (!hasChanges) {
      return instance;
    }

    const ctor = instance.constructor as unknown as RecordConstructor<
      T,
      Record<string, never>
    >;
    const data: Partial<T> = Object.create(null);

    for (const key of ctor.fields) {
      data[key] = (
        key in updates ? updates[key] : instance[key as string]
      ) as T[typeof key];
    }

    return ctor.create(data);
  }
}

interface RecordConstructor<
  T extends Record<string, ValidValue>,
  C extends Record<string, unknown> = Record<string, never>,
> {
  readonly fields: FieldsOf<T>;
  readonly defaults: Readonly<T>;
  readonly typeId: number;
  readonly __kind: symbol;

  new (data: T): Readonly<T & C> & RecordInstance;

  create(data?: Partial<T>): Readonly<T & C> & RecordInstance;
  equals(a: unknown, b: unknown): boolean;
}
