import { untracked } from "@reflex/runtime";
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

interface DisposableResourceLike {
  [DISPOSE](): void;
}

interface DisposableLike extends DisposableResourceLike {
  dispose(): void;
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

type ModelTypeError<Message extends string> = Message;

type DisposedHint = {
  disposed?: boolean;
  isDisposed?: boolean;
};

type PrimitiveModelValue = ModelActionBrand | DisposableResourceLike;

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
export type ModelFactory<TModel, TArgs extends unknown[]> = (
  ctx: ModelContext,
  ...args: TArgs
) => TModel & ValidateModel<TModel>;

export type ModelTuple<TArgs extends unknown[], TModel> = (
  ...args: TArgs
) => Model<TModel>;

type CheckedModelFactory<TArgs extends unknown[], TModel extends object> = ((
  ctx: ModelContext,
  ...args: TArgs
) => TModel) &
  ((ctx: ModelContext, ...args: TArgs) => ValidateModel<TModel>);

function createAction<TArgs extends unknown[], TReturn>(
  state: ModelState,
  fn: (...args: TArgs) => TReturn,
): ModelAction<TArgs, TReturn> {
  return markModelAction(function modelAction(
    this: unknown,
    ...args: TArgs
  ): TReturn {
    if (state.disposed) {
      if (__DEV__) {
        throw new Error(
          "Cannot call a model action after the model was disposed.",
        );
      }
      return undefined as TReturn;
    }

    return batch(() => {
      let result = undefined as TReturn;

      untracked(() => {
        result = fn.apply(this, args);
      });

      return result;
    });
  });
}

function validateModelShape(value: unknown, path = "model"): void {
  if (
    isModelReadableValue(value) ||
    isModelActionValue(value) ||
    isDisposableValue(value)
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
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { dispose?: unknown }).dispose === "function" &&
    typeof (value as { [DISPOSE]?: unknown })[DISPOSE] === "function"
  );
}

function isDisposableValue(value: unknown): value is DisposableResourceLike {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { [DISPOSE]?: unknown })[DISPOSE] === "function"
  );
}

/**
 * Registers a nested disposable so it is disposed with the parent model.
 */
export function own<T extends DisposableResourceLike>(
  ctx: ModelContext,
  value: T,
): T {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const kind = typeof value;

    if (kind === "object" || kind === "function") {
      const hint = value as DisposedHint;
      if (hint.disposed === true || hint.isDisposed === true) {
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
 *
 * The returned factory preserves:
 * - model arguments
 * - reactive values
 * - action signatures
 *
 * @returns A function that creates model instances.
 *
 * @example
 * ```ts
 * const createCounterModel = createModel((ctx) => {
 *   const count = signal(0);
 *
 *   const bumpTwice = ctx.action(() => {
 *     count.set((value) => value + 2);
 *   });
 *
 *   return {
 *     count,
 *     bumpTwice,
 *   };
 * });
 *
 * const counter = createCounterModel();
 *
 * counter.count();   // number
 * counter.bumpTwice();
 * counter.dispose();
 * ```
 *
 * @example
 * ```ts
 * // Inferred type
 * const createCounterModel: ModelTuple<
 *   [], // List of incoming model args (ctx, excluded)
 *   {
 *     count: Signal<number>;
 *     bumpTwice: ModelAction<
 *       [], // List of incoming actions args
 *       void
 *     >;
 *   }
 * >
 * ```
 *
 */
export function createModel<TArgs extends unknown[], TModel extends object>(
  factory: CheckedModelFactory<TArgs, TModel>,
): ModelTuple<TArgs, TModel> {
  return function model(...args: TArgs): Model<TModel> {
    const state: ModelState = { disposed: false };
    let cleanups: Cleanup[] | null = null;

    const ctx: ModelContext = {
      action(fn) {
        return createAction(state, fn);
      },

      onDispose(fn) {
        if (state.disposed) {
          if (__DEV__) {
            throw new Error(
              "Cannot register cleanup after the model was disposed.",
            );
          }
          return;
        }

        (cleanups ??= []).push(fn);
      },

      get disposed() {
        return state.disposed;
      },
    };

    const model = factory(ctx, ...args) as Model<TModel>;

    if (__DEV__) {
      validateModelShape(model);
    }

    const dispose = () => {
      if (state.disposed) return;
      state.disposed = true;

      const list = cleanups;
      if (list === null) return;

      for (let i = list.length - 1; i >= 0; i--) {
        const cleanup = list[i];
        if (!cleanup) continue;

        try {
          cleanup();
        } catch (error) {
          console.error("Error during model disposal:", error);
        }
      }

      cleanups = null;
    };

    const disposableModel = model as Model<TModel> & DisposableLike;
    disposableModel.dispose = dispose;
    disposableModel[DISPOSE] = dispose;

    return model;
  };
}
