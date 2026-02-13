// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Primitive = string | number | boolean | null;

interface RecordInstance {
  readonly hashCode: number;
}

interface RecordClass {
  readonly __kind: symbol;
  equals(a: unknown, b: unknown): boolean;
}

type ValidValue = Primitive | RecordInstance;
type ComputedFn<T, V> = (instance: T) => V;

type RecordOf<
  T extends Record<string, ValidValue>,
  C extends Record<string, unknown> = Record<string, never>,
> = Readonly<T & C> & RecordInstance;

interface RecordConstructor<
  T extends Record<string, ValidValue>,
  C extends Record<string, unknown> = Record<string, never>,
> {
  readonly fields: ReadonlyArray<keyof T>;
  readonly defaults: Readonly<T>;
  readonly typeId: number;
  readonly __kind: symbol;

  new (data: T): RecordOf<T, C>;
  create(data?: Partial<T>): RecordOf<T, C>;
  equals(a: unknown, b: unknown): boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ENABLE_FREEZE = true;
const TYPE_MARK = Symbol("RecordType");

// ============================================================================
// HASHING MODULE - Pure functions for V8 optimization
// ============================================================================

class HashingModule {
  // FNV-1a для строк - fast, good distribution
  static hashString(str: string): number {
    let hash = 2166136261;
    const len = str.length;
    for (let i = 0; i < len; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash | 0;
  }

  static hashNumber(n: number): number {
    return Object.is(n, -0) ? 0 : n | 0;
  }

  static hashBoolean(b: boolean): number {
    return b ? 1 : 2;
  }

  static hashRecord(record: RecordInstance): number {
    return record.hashCode;
  }

  // Мономорфная версия - V8 может заинлайнить
  static hashValue(value: ValidValue): number {
    if (value === null) return 0;

    const type = typeof value;

    if (type === "number") return HashingModule.hashNumber(value as number);
    if (type === "string") return HashingModule.hashString(value as string);
    if (type === "boolean") return HashingModule.hashBoolean(value as boolean);

    // Record instance
    if (type === "object") {
      const ctor = (value as RecordInstance).constructor;
      if (
        typeof ctor === "function" &&
        "__kind" in ctor &&
        ctor.__kind === TYPE_MARK
      ) {
        return HashingModule.hashRecord(value as RecordInstance);
      }
    }

    throw new TypeError("Invalid value inside Record");
  }

  // Комбинирование хешей
  static combineHash(current: number, next: number): number {
    return (Math.imul(31, current) + next) | 0;
  }
}

// ============================================================================
// VALIDATION MODULE - Type checking
// ============================================================================

class ValidationModule {
  static isValidPrimitive(base: Primitive, value: ValidValue): boolean {
    if (base === null) return value === null;
    return typeof base === typeof value;
  }

  static isValidRecord(base: RecordInstance, value: ValidValue): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      value.constructor === base.constructor
    );
  }

  static validate(base: ValidValue, value: ValidValue): boolean {
    if (base === null || typeof base !== "object") {
      return ValidationModule.isValidPrimitive(base as Primitive, value);
    }

    const ctor = base.constructor;
    if (
      typeof ctor === "function" &&
      "__kind" in ctor &&
      ctor.__kind === TYPE_MARK
    ) {
      return ValidationModule.isValidRecord(base, value);
    }

    return typeof base === typeof value;
  }
}

// ============================================================================
// FIELD DESCRIPTOR - Metadata для каждого типа записи
// ============================================================================

class FieldDescriptor<T extends Record<string, ValidValue>> {
  readonly fields: ReadonlyArray<keyof T>;
  readonly fieldCount: number;
  readonly fieldIndex: Map<string, number>;
  readonly defaults: Readonly<T>;

  constructor(defaults: T) {
    // Сразу freeze для V8 optimization (stable hidden class)
    this.fields = Object.freeze(Object.keys(defaults)) as ReadonlyArray<
      keyof T
    >;
    this.fieldCount = this.fields.length;

    // Pre-compute field index для O(1) lookup
    this.fieldIndex = new Map<string, number>();
    for (let i = 0; i < this.fieldCount; i++) {
      this.fieldIndex.set(this.fields[i] as string, i);
    }

    // Копируем defaults для иммутабельности
    const frozenDefaults = {} as T;
    for (let i = 0; i < this.fieldCount; i++) {
      frozenDefaults[this.fields[i]] = defaults[this.fields[i]];
    }
    this.defaults = Object.freeze(frozenDefaults);
  }

  // Создание data object - монomorphic для V8
  createDataObject(): T {
    const data = {} as T;
    for (let i = 0; i < this.fieldCount; i++) {
      data[this.fields[i]] = this.defaults[this.fields[i]];
    }
    return data;
  }

  // Merge с validation
  mergeData(target: T, source: Partial<T>): void {
    const keys = Object.keys(source) as Array<keyof T>;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = source[key]!;

      if (!ValidationModule.validate(this.defaults[key], value)) {
        throw new TypeError(`Invalid value for field "${String(key)}"`);
      }

      target[key] = value;
    }
  }

  // Копирование из instance
  copyFromInstance<C extends Record<string, unknown>>(
    instance: RecordOf<T, C>,
    target: T,
  ): void {
    for (let i = 0; i < this.fieldCount; i++) {
      const key = this.fields[i];
      target[key] = instance[key as string];
    }
  }
}

// ============================================================================
// COMPUTED PROPERTIES MANAGER
// ============================================================================

class ComputedPropertiesManager<
  T extends Record<string, ValidValue>,
  C extends Record<string, unknown>,
> {
  private readonly keys: ReadonlyArray<keyof C>;
  private readonly functions: { [K in keyof C]: ComputedFn<Readonly<T>, C[K]> };

  constructor(computed: { [K in keyof C]: ComputedFn<Readonly<T>, C[K]> }) {
    this.keys = Object.freeze(Object.keys(computed)) as ReadonlyArray<keyof C>;
    this.functions = computed;
  }

  defineProperties(instance: object, cache: Partial<C>): void {
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      const compute = this.functions[key];

      Object.defineProperty(instance, key, {
        enumerable: true,
        configurable: false,
        get(): C[typeof key] {
          if (key in cache) return cache[key]!;
          const value = compute(instance as Readonly<T>);
          cache[key] = value;
          return value;
        },
      });
    }
  }

  get isEmpty(): boolean {
    return this.keys.length === 0;
  }
}

// ============================================================================
// RECORD FACTORY - Main API
// ============================================================================

export class RecordFactory {
  private static nextTypeId = 1;

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
    const descriptor = new FieldDescriptor(defaults);
    const computedManager = computed
      ? new ComputedPropertiesManager(computed)
      : null;
    const typeId = RecordFactory.nextTypeId++;

    return RecordFactory.buildConstructor(descriptor, computedManager, typeId);
  }

  private static buildConstructor<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown>,
  >(
    descriptor: FieldDescriptor<T>,
    computedManager: ComputedPropertiesManager<T, C> | null,
    typeId: number,
  ): RecordConstructor<T, C> {
    const { fields, fieldCount } = descriptor;

    class Struct {
      static readonly fields = fields;
      static readonly defaults = descriptor.defaults;
      static readonly typeId = typeId;
      static readonly __kind = TYPE_MARK;
      static readonly fieldIndex = descriptor.fieldIndex;
      static readonly descriptor = descriptor;

      #hash: number | undefined;
      #cache: Partial<C> | null;
      #fieldHashes: Int32Array | null;

      constructor(data: T) {
        // Копируем поля - V8 создаст stable shape
        for (let i = 0; i < fieldCount; i++) {
          const key = fields[i];
          (this as Record<string, unknown>)[key as string] = data[key];
        }

        // Computed properties
        if (computedManager) {
          this.#cache = {};
          computedManager.defineProperties(this, this.#cache);
        } else {
          this.#cache = null;
        }

        this.#hash = undefined;
        this.#fieldHashes = null;

        if (ENABLE_FREEZE) {
          Object.freeze(this);
        } else {
          Object.seal(this);
        }
      }

      get hashCode(): number {
        if (this.#hash !== undefined) return this.#hash;

        let hash = typeId | 0;
        const instance = this as Record<string, unknown>;

        for (let i = 0; i < fieldCount; i++) {
          const value = instance[fields[i] as string] as ValidValue;
          const valueHash = HashingModule.hashValue(value);
          hash = HashingModule.combineHash(hash, valueHash);
        }

        return (this.#hash = hash);
      }

      // Для diff operations - lazy computation
      getFieldHash(index: number): number {
        if (!this.#fieldHashes) {
          this.#fieldHashes = new Int32Array(fieldCount);
          const instance = this as Record<string, unknown>;

          for (let i = 0; i < fieldCount; i++) {
            const value = instance[fields[i] as string] as ValidValue;
            this.#fieldHashes[i] = HashingModule.hashValue(value);
          }
        }
        return this.#fieldHashes[index];
      }

      static create(data?: Partial<T>): RecordOf<T, C> {
        if (!data || Object.keys(data).length === 0) {
          return new Struct(descriptor.defaults) as unknown as RecordOf<T, C>;
        }

        const prepared = descriptor.createDataObject();
        descriptor.mergeData(prepared, data);

        return new Struct(prepared) as unknown as RecordOf<T, C>;
      }

      static equals(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (!a || !b) return false;
        if (typeof a !== "object" || typeof b !== "object") return false;

        const recA = a as RecordOf<T, C>;
        const recB = b as RecordOf<T, C>;

        if (recA.constructor !== recB.constructor) return false;
        if (recA.hashCode !== recB.hashCode) return false;

        // Детальное сравнение
        for (let i = 0; i < fieldCount; i++) {
          const key = fields[i] as string;
          const va = recA[key];
          const vb = recB[key];

          if (va === vb) continue;

          const typeA = typeof va;
          const typeB = typeof vb;

          if (typeA !== "object" || typeB !== "object") return false;

          // Nested record
          if (
            va !== null &&
            typeof va === "object" &&
            "constructor" in (va as object)
          ) {
            const ctor = (va as RecordInstance)
              .constructor as unknown as RecordClass;
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

  // ============================================================================
  // MUTATION OPERATIONS
  // ============================================================================

  static fork<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown> = Record<string, never>,
  >(instance: RecordOf<T, C>, updates: Partial<T>): RecordOf<T, C> {
    if (!updates) return instance;

    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) return instance;

    const ctor = instance.constructor as unknown as RecordConstructor<T, C> & {
      descriptor: FieldDescriptor<T>;
    };
    const descriptor = ctor.descriptor;

    const data = descriptor.createDataObject();
    descriptor.copyFromInstance(instance, data);

    // Применяем изменения
    let hasChanges = false;
    for (let i = 0; i < updateKeys.length; i++) {
      const key = updateKeys[i] as keyof T;
      const newValue = updates[key]!;

      if (data[key] !== newValue) {
        hasChanges = true;
        data[key] = newValue;
      }
    }

    return hasChanges ? ctor.create(data) : instance;
  }

  static forkWithDiff<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown> = Record<string, never>,
  >(
    instance: RecordOf<T, C>,
    updates: Partial<T>,
  ): readonly [RecordOf<T, C>, Int32Array] {
    if (!updates) return [instance, new Int32Array(0)];

    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) return [instance, new Int32Array(0)];

    const ctor = instance.constructor as unknown as RecordConstructor<T, C> & {
      descriptor: FieldDescriptor<T>;
      fieldIndex: Map<string, number>;
    };
    const descriptor = ctor.descriptor;

    const data = descriptor.createDataObject();
    descriptor.copyFromInstance(instance, data);

    // Pre-allocate worst case
    const changedIndices: number[] = [];

    for (let i = 0; i < updateKeys.length; i++) {
      const key = updateKeys[i] as keyof T;
      const newValue = updates[key]!;

      if (data[key] !== newValue) {
        const idx = ctor.fieldIndex.get(key as string);
        if (idx !== undefined) {
          changedIndices.push(idx);
        }
        data[key] = newValue;
      }
    }

    if (changedIndices.length === 0) {
      return [instance, new Int32Array(0)];
    }

    return [ctor.create(data), new Int32Array(changedIndices)] as const;
  }

  static diff<
    T extends Record<string, ValidValue>,
    C extends Record<string, unknown> = Record<string, never>,
  >(prev: RecordOf<T, C>, next: RecordOf<T, C>): Int32Array {
    if (prev === next) return new Int32Array(0);
    if (prev.constructor !== next.constructor) {
      throw new TypeError("Cannot diff different record types");
    }

    const ctor = prev.constructor as unknown as RecordConstructor<T, C>;
    const fields = ctor.fields;
    const fieldCount = fields.length;
    const changed: number[] = [];

    for (let i = 0; i < fieldCount; i++) {
      const key = fields[i] as string;
      if (prev[key] !== next[key]) {
        changed.push(i);
      }
    }

    return new Int32Array(changed);
  }
}
