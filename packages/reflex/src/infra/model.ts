import { getDefaultContext } from "@reflex/runtime";
import { batch } from "./runtime";
import {
  isModelActionValue,
  isModelReadableValue,
  markModelAction,
  type ModelAction,
  type ModelActionBrand,
} from "./modelValue";

type Cleanup = () => void;
type ModelState = { disposed: boolean };

const DISPOSE = Symbol.dispose;
const MODEL_DISPOSED = Symbol("MODEL_DISPOSED");

interface DisposableLike {
  [DISPOSE](): void;
}

interface ModelContext {
  /**
   * Wraps a model mutation so it runs untracked and inside the active batch.
   *
   * Model actions are the only supported function values inside a model shape.
   */
  action<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => TReturn,
  ): ModelAction<TArgs, TReturn>;

  /**
   * Registers cleanup that runs when the model is disposed.
   */
  onDispose(fn: Cleanup): void;

  /**
   * Indicates whether the current model instance has been disposed.
   */
  readonly disposed: boolean;
}

const MODEL_BRAND = Symbol("MODEL_BRAND");

type ModelTypeError<Message extends string> = Message;

type DisposedHint = {
  disposed?: boolean;
  isDisposed?: boolean;
  [MODEL_DISPOSED]?: boolean;
};

type ReadableModelBrand =
  | Brand<"signal">
  | Brand<"computed">
  | Brand<"memo">
  | Brand<"derived">
  | Brand<"realtime">
  | Brand<"stream">;

type PrimitiveModelValue =
  | ReadableModelBrand
  | ModelActionBrand
  | DisposableLike;

type InvalidModelValue =
  ModelTypeError<"Model values must be readable reactive values, model actions, or nested objects.">;

type InvalidEffectValue =
  ModelTypeError<"Effects are not allowed inside models. Use computed values, actions, and ctx.onDispose() instead.">;

type ValidateModel<T> =
  T extends Effect<unknown>
    ? InvalidEffectValue
    : T extends PrimitiveModelValue
      ? T
      : T extends (...args: unknown[]) => unknown
        ? InvalidModelValue
        : T extends object
          ? { [K in keyof T]: ValidateModel<T[K]> }
          : InvalidModelValue;

export type Model<T> = ValidateModel<T> & DisposableLike;
export type ModelShape<T extends object> = T & ValidateModel<T>;
export type ValidatedModelShape<T> = ValidateModel<T>;

/**
 * Factory used by `createModel()`.
 *
 * The return value may contain only:
 * - readable reactive values such as `signal()`, `computed()`, and `memo()`
 * - actions created with `ctx.action(...)`
 * - nested plain objects following the same rules
 */
export type ModelFactory<TModel, TArgs extends unknown[] = []> = (
  ctx: ModelContext,
  ...args: TArgs
) => TModel & ValidateModel<TModel>;

export type ModelTuple<TModel, TArgs extends unknown[] = []> = (
  ...args: TArgs
) => Model<TModel>;

type ModelFactoryArgs<TFactory> = TFactory extends (
  ctx: ModelContext,
  ...args: infer TArgs
) => unknown
  ? TArgs
  : never;

type ModelFactoryReturn<TFactory> = TFactory extends (
  ...args: never[]
) => infer TModel
  ? TModel
  : never;

type CheckedModelFactory<TFactory extends ModelFactory<object, unknown[]>> =
  TFactory &
    ((
      ctx: ModelContext,
      ...args: ModelFactoryArgs<TFactory>
    ) => ValidateModel<ModelFactoryReturn<TFactory>>);

function createAction<TArgs extends unknown[], TReturn>(
  state: ModelState,
  fn: (...args: TArgs) => TReturn,
): ModelAction<TArgs, TReturn> {
  return markModelAction(function modelAction(
    this: unknown,
    ...args: TArgs
  ): TReturn {
    if (state.disposed) {
      throw new Error(
        "Cannot call a model action after the model was disposed.",
      );
    }

    return batch(() => {
      const context = getDefaultContext();
      const prev = context.activeComputed;
      context.activeComputed = null;

      try {
        return fn.apply(this, args);
      } finally {
        context.activeComputed = prev;
      }
    });
  });
}

function validateModelShape(value: unknown, path = "model"): void {
  if (
    isModelReadableValue(value) ||
    isModelActionValue(value) ||
    isModel(value)
  ) {
    return;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(
      `Invalid ${path}: model values must be readable reactive values, model actions, or nested objects.`,
    );
  }

  for (const [key, nested] of Object.entries(value)) {
    validateModelShape(nested, `${path}.${key}`);
  }
}

export function isModel(value: unknown): value is DisposableLike {
  return typeof value === "object" && value !== null && MODEL_BRAND in value;
}

/**
 * Registers a nested disposable so it is disposed with the parent model.
 */
export function own<T extends DisposableLike>(ctx: ModelContext, value: T): T {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const kind = typeof value;
    if (kind === "object" || kind === "function") {
      const hint = value as DisposedHint;
      if (hint[MODEL_DISPOSED] === true || hint.disposed === true || hint.isDisposed === true) {
        console.warn(
          "own(ctx, value) received a disposed resource. This is allowed but likely a bug.",
        );
      }
    }
  }

  ctx.onDispose(() => value[DISPOSE]!());
  return value;
}

/**
 * Creates a disposable model factory with strict model-shape validation.
 *
 * Models are intended for grouping reactive accessors, actions, and owned
 * resources behind one lifecycle boundary.
 *
 * Actions created with `ctx.action(...)`:
 * - run untracked
 * - run inside the active `batch()`
 * - throw after model disposal
 *
 * Effects are intentionally forbidden inside model shapes. If a model needs
 * ownership-aware resources, create them outside the returned object and wire
 * their teardown through `ctx.onDispose()` or `own(ctx, value)`.
 *
 * Disposal is idempotent and marks the model as dead before running cleanups.
 * Cleanup errors are logged and do not prevent remaining cleanups from running.
 */
export function createModel<TFactory extends ModelFactory<object, unknown[]>>(
  factory: CheckedModelFactory<TFactory>,
): ModelTuple<ModelFactoryReturn<TFactory>, ModelFactoryArgs<TFactory>> {
  return (
    ...args: ModelFactoryArgs<TFactory>
  ): Model<ModelFactoryReturn<TFactory>> => {
    const state: ModelState = { disposed: false };
    const cleanups: Cleanup[] = [];

    const ctx: ModelContext = {
      action(fn) {
        return createAction(state, fn);
      },

      onDispose(fn) {
        if (state.disposed) {
          throw new Error(
            "Cannot register cleanup after the model was disposed.",
          );
        }

        cleanups.push(fn);
      },

      get disposed() {
        return state.disposed;
      },
    };

    const model = factory(ctx, ...args) as Model<ModelFactoryReturn<TFactory>>;
    validateModelShape(model);

    Object.defineProperty(model, MODEL_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(model, MODEL_DISPOSED, {
      value: false,
      enumerable: false,
      configurable: false,
      writable: true,
    });

    Object.defineProperty(model, DISPOSE, {
      value() {
        if (state.disposed) return;
        state.disposed = true;
        (model as DisposedHint)[MODEL_DISPOSED] = true;

        for (let i = cleanups.length - 1; i >= 0; i--) {
          const cleanup = cleanups[i];
          if (!cleanup) continue;

          try {
            cleanup();
          } catch (error) {
            console.error("Error during model disposal:", error);
          }
        }

        cleanups.length = 0;
      },
      enumerable: false,
      configurable: false,
      writable: false,
    });

    return model;
  };
}
