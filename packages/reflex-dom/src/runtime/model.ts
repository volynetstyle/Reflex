import {
  addCleanup,
  adoptOwnershipNode,
  assertSynchronous,
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  getActiveOwnerContext,
  isShuttingDown,
  LifecycleHandle,
  runWithOwner,
  type DisposableResource,
  type Synchronous,
} from "@volynets/reflex-framework";
import { untracked } from "@volynets/reflex-runtime";
import {
  getActiveDOMContext,
  getDefaultDOMRuntime,
  withDOMContext,
} from "./context";

const READABLE_TYPE: unique symbol = Symbol("reflex.model.readable");
const ACTION_TYPE: unique symbol = Symbol("reflex.model.action");
const MODEL_TYPE: unique symbol = Symbol("reflex.model");
const MODEL_NODE = Symbol("model.owner-node");

export type AnyFunction = (...args: never[]) => unknown;
/** A private marker carried by accessors created with `ModelContext.read()`. */
export type ModelReadableBrand = { readonly [READABLE_TYPE]: true };
/** A private marker carried by callbacks created with `ModelContext.action()`. */
export type ModelActionBrand = { readonly [ACTION_TYPE]: true };
/** A private marker carried by model instances. */
export type ModelBrand = { readonly [MODEL_TYPE]: true };
/**
 * A tracked, read-only model accessor. Calling it evaluates the supplied read
 * function in the caller's active reactive context.
 */
export type ModelReadable<T> = (() => T) & ModelReadableBrand;
/** A synchronous callback wrapped by `ModelContext.action()`. */
export type ModelAction<
  Args extends unknown[] = unknown[],
  Result = unknown,
  This = unknown,
> = ((this: This, ...args: Args) => Result) & ModelActionBrand;
type WrappedAction<F extends AnyFunction> = ModelAction<
  Parameters<F>,
  ReturnType<F>,
  ThisParameterType<F>
>;

export interface ModelContext {
  /**
   * Wrap a read as a branded, read-only accessor. Dependencies are recorded by
   * the reactive computation that calls the returned accessor.
   */
  read<T>(read: () => T): ModelReadable<T>;
  /**
   * Wrap a synchronous callback in a batch and model ownership context. The
   * callback runs untracked; this boundary does not provide state rollback.
   */
  action<F extends AnyFunction>(fn: Synchronous<F>): WrappedAction<F>;
  /** Create a reusable handle for idempotent adoption of a disposable resource. */
  handle<T extends DisposableResource>(resource: T): LifecycleHandle<T>;
  /** Attach a handle, resource, or child model to this model's lifetime. */
  own<T extends DisposableResource>(resource: LifecycleHandle<T>): T;
  /** Adopt a disposable resource once. Reuse a handle for idempotent adoption. */
  own<T extends DisposableResource>(resource: T): T;
  /** Register synchronous cleanup that runs when this model is disposed. */
  onDispose<F extends () => unknown>(cleanup: Synchronous<F>): void;
  /** True while the model is closing or after it has been disposed. */
  readonly disposed: boolean;
}

/** A model namespace with an explicit disposable lifetime. */
export interface ModelHandle extends DisposableResource, ModelBrand {
  /** Dispose this model and all child models and resources it owns. */
  dispose(): void;
  /** True while closing or after disposal has completed. */
  readonly disposed: boolean;
}

type InvalidMember =
  "Use ctx.read(), ctx.action(), a child model or a namespace.";
type InvalidRoot = "A model factory must return a plain namespace object.";
type ReservedMember = "This property is reserved for the model lifecycle.";
type Capability = ModelReadableBrand | ModelActionBrand | ModelBrand;

export type ValidatedModelShape<T> = T extends Capability
  ? T
  : T extends AnyFunction | readonly unknown[]
    ? InvalidMember
    : T extends object
      ? { readonly [K in keyof T]: ValidatedModelShape<T[K]> }
      : InvalidMember;

type CheckedRoot<T> = T extends Capability | AnyFunction | readonly unknown[]
  ? InvalidRoot
  : T extends object
    ? {
        readonly [K in keyof T]: K extends
          | "dispose"
          | "disposed"
          | typeof Symbol.dispose
          ? ReservedMember
          : ValidatedModelShape<T[K]>;
      }
    : InvalidRoot;

/** A model's validated namespace combined with its lifecycle handle. */
export type Model<T extends object> = ValidatedModelShape<T> & ModelHandle;
/** The callable factory returned by `defineModel()`. */
export type ModelFactory<Args extends unknown[], Shape extends object> = (
  ...args: Args
) => Model<Shape>;
/** The setup callback passed to `defineModel()`. */
export type ModelSetup<Args extends unknown[], Shape extends object> = (
  ctx: ModelContext,
  ...args: Args
) => Shape & CheckedRoot<Shape>;
type CheckedSetup<Args extends unknown[], Shape extends object> = ((
  ctx: ModelContext,
  ...args: Args
) => Shape) &
  ((ctx: ModelContext, ...args: Args) => CheckedRoot<Shape>);

/** Options accepted by `defineModel()`. */
export interface ModelOptions {
  /** Override the batch function used by model setup, actions, and cleanup. */
  batch?: <T>(fn: () => T) => T;
}

function hasBrand(value: unknown, brand: symbol): boolean {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  try {
    return (value as { [key: symbol]: unknown })[brand] === true;
  } catch {
    return false;
  }
}

function markCapability(value: object, brand: symbol): void {
  Object.defineProperty(value, brand, { value: true });
}

/** Type guard for model instances. */
export function isModel(value: unknown): value is Model<object> {
  return (
    typeof value === "object" && value !== null && hasBrand(value, MODEL_TYPE)
  );
}

/** Check whether a value is an accessor created by `ctx.read()`. */
export function isModelReadableValue(
  value: unknown,
): value is ModelReadable<unknown> {
  return typeof value === "function" && hasBrand(value, READABLE_TYPE);
}

/** Check whether a value is an action created by `ctx.action()`. */
export function isModelActionValue(value: unknown): value is ModelAction {
  return typeof value === "function" && hasBrand(value, ACTION_TYPE);
}

/** The value returned by a branded readable; other types are unchanged. */
export type ModelValue<T> = T extends ModelReadable<infer V> ? V : T;

/**
 * Read a branded model accessor and return its value. Other values, including
 * ordinary functions, are returned unchanged.
 */
export function readModelValue<T>(value: T): ModelValue<T> {
  if (typeof value !== "function") return value as ModelValue<T>;
  if (!hasBrand(value, READABLE_TYPE)) return value as ModelValue<T>;
  return (value as unknown as ModelReadable<unknown>)() as ModelValue<T>;
}

const ACTIVE = 1 as const;
const DONE = 2 as const;

type VisitState = typeof ACTIVE | typeof DONE;
type NamespaceKey = string | symbol;

const PLAIN_OBJECT_PROTOTYPE = Object.prototype;

const ERR_USE_MODEL_VALUE =
  "Use ctx.read(), ctx.action(), a child model or a namespace.";

function throwShapeError(
  path: readonly NamespaceKey[],
  depth: number,
  key: NamespaceKey | undefined,
  message: string,
): never {
  let location = "model";

  for (let i = 0; i < depth; i++) {
    location += ".";
    location += String(path[i]);
  }

  if (key !== undefined) {
    location += ".";
    location += String(key);
  }

  throw new TypeError(`${location}: ${message}`);
}

export function validateShape(root: object): object[] {
  const namespaces: object[] = [];

  // 1 = currently on the DFS stack; 2 = already validated.
  const state = new Map<object, VisitState>();

  // Parallel stacks avoid recursive calls and per-frame object allocation.
  const nodeStack: object[] = [];
  const keyStack: NamespaceKey[][] = [];
  const indexStack: number[] = [];

  // Contains only keys from root to the current DFS node.
  // Strings are created only on the error path.
  const path: NamespaceKey[] = [];

  // ── Root ──────────────────────────────────────────────────────────────

  const rootType = typeof root;

  if (
    root !== null &&
    (rootType === "object" || rootType === "function") &&
    (isModel(root) || isModelReadableValue(root) || isModelActionValue(root))
  ) {
    throw new TypeError("model: expected a namespace root.");
  }

  if (rootType !== "object" || root === null) {
    throw new TypeError(`model: ${ERR_USE_MODEL_VALUE}`);
  }

  const rootPrototype = Object.getPrototypeOf(root);

  if (rootPrototype !== PLAIN_OBJECT_PROTOTYPE && rootPrototype !== null) {
    throw new TypeError("model: expected a plain namespace object.");
  }

  state.set(root, ACTIVE);
  namespaces.push(root);

  nodeStack[0] = root;
  keyStack[0] = Reflect.ownKeys(root);
  indexStack[0] = 0;

  // ── Iterative DFS ─────────────────────────────────────────────────────

  let depth = 0;

  while (depth >= 0) {
    const node = nodeStack[depth]!;
    const keys = keyStack[depth]!;
    const index = indexStack[depth]!;

    // Namespace completely processed.
    if (index === keys.length) {
      state.set(node, DONE);
      depth--;
      continue;
    }

    const key = keys[index]!;

    // Advance immediately, so child traversal needs no return bookkeeping.
    indexStack[depth] = index + 1;

    if (
      depth === 0 &&
      (key === "dispose" || key === "disposed" || key === Symbol.dispose)
    ) {
      throwShapeError(path, depth, key, "reserved lifecycle property.");
    }

    const descriptor = Object.getOwnPropertyDescriptor(node, key);

    // For ordinary plain objects descriptor cannot disappear between
    // ownKeys() and getOwnPropertyDescriptor(). The undefined check also
    // gives sensible behavior for pathological proxies/mutation.
    if (descriptor === undefined || !("value" in descriptor)) {
      throwShapeError(
        path,
        depth,
        key,
        "namespace getters/setters are forbidden.",
      );
    }

    const value = descriptor.value;
    const type = typeof value;

    // ── Object child ────────────────────────────────────────────────────

    if (type === "object") {
      if (value === null) {
        throwShapeError(path, depth, key, ERR_USE_MODEL_VALUE);
      }

      if (isModel(value)) {
        continue;
      }

      const prototype = Object.getPrototypeOf(value);

      if (prototype !== PLAIN_OBJECT_PROTOTYPE && prototype !== null) {
        throwShapeError(path, depth, key, "expected a plain namespace object.");
      }

      const visitState = state.get(value);

      if (visitState === ACTIVE) {
        throwShapeError(path, depth, key, "cyclic model namespace.");
      }

      if (visitState === DONE) {
        continue;
      }

      state.set(value, ACTIVE);
      namespaces.push(value);

      // path[0..depth] describes the child we're entering.
      path.length = depth;
      path[depth] = key;

      depth++;

      // Reuse parallel stack slots instead of allocating frame objects.
      nodeStack[depth] = value;
      keyStack[depth] = Reflect.ownKeys(value);
      indexStack[depth] = 0;

      continue;
    }

    // ── Function capability ─────────────────────────────────────────────

    if (type === "function") {
      if (isModelReadableValue(value) || isModelActionValue(value)) {
        continue;
      }

      throwShapeError(path, depth, key, ERR_USE_MODEL_VALUE);
    }

    // ── Primitive ───────────────────────────────────────────────────────

    throwShapeError(path, depth, key, ERR_USE_MODEL_VALUE);
  }

  return namespaces;
}

/**
 * Define a reusable model factory. Each invocation creates an independent
 * instance whose namespace contains model capabilities, child models, or
 * plain namespace objects.
 *
 * Instances created during a component or model setup/action are owned by that
 * lifetime. An instance created without an active owner must be disposed
 * explicitly.
 *
 * @param setup Creates the model namespace from a lifecycle context and factory
 * arguments.
 * @param options Optional override for the batch boundary used by the model.
 */
export function defineModel<Args extends unknown[], Shape extends object>(
  setup: CheckedSetup<Args, Shape>,
  options: ModelOptions = {},
): ModelFactory<Args, Shape> {
  return function createInstance(...args: Args): Model<Shape> {
    const domContext = getActiveDOMContext();
    const runBatch =
      options.batch ??
      domContext?.runtime.batch ??
      getDefaultDOMRuntime().batch;
    const activeOwner = getActiveOwnerContext();
    const owner = activeOwner ?? createOwnerContext();
    const ownerNode = activeOwner?.currentNode ?? null;
    const node = createOwnershipNode();
    const runCleanup = <T>(fn: () => T): T => runBatch(() => untracked(fn));
    const assertOpen = (): void => {
      if (__DEV__ && isShuttingDown(node)) {
        throw new Error("The lifecycle scope is closed.");
      }
    };

    const ctx: ModelContext = {
      read(read) {
        assertOpen();
        const view = (() => {
          assertOpen();
          if (isShuttingDown(node)) return undefined as ReturnType<typeof read>;
          return read();
        }) as ModelReadable<ReturnType<typeof read>>;
        markCapability(view, READABLE_TYPE);
        return view;
      },
      action(fn) {
        assertOpen();
        const action = function (this: unknown, ...actionArgs: unknown[]) {
          assertOpen();
          if (isShuttingDown(node)) return undefined as ReturnType<typeof fn>;
          return runBatch(() =>
            untracked(() =>
              runWithOwner(owner, node, () =>
                domContext === null
                  ? assertSynchronous(Reflect.apply(fn, this, actionArgs))
                  : withDOMContext(domContext, () =>
                      assertSynchronous(Reflect.apply(fn, this, actionArgs)),
                    ),
              ),
            ),
          );
        };
        markCapability(action, ACTION_TYPE);
        return action as unknown as WrappedAction<typeof fn>;
      },
      own(resource) {
        assertOpen();
        if (isShuttingDown(node)) return resource;

        if (resource instanceof LifecycleHandle) {
          adoptOwnershipNode(node, resource.node);
          return resource.value;
        } else if (isModel(resource)) {
          const childNode = (
            resource as unknown as ModelHandle & {
              [MODEL_NODE]: ReturnType<typeof createOwnershipNode>;
            }
          )[MODEL_NODE];
          adoptOwnershipNode(node, childNode);
        } else {
          const handle = new LifecycleHandle(resource, runCleanup);
          adoptOwnershipNode(node, handle.node);
        }
        return resource;
      },
      handle(resource) {
        return new LifecycleHandle(resource, runCleanup);
      },
      onDispose(cleanup) {
        assertOpen();
        if (isShuttingDown(node)) return;
        addCleanup(node, () => runCleanup(() => assertSynchronous(cleanup())));
      },
      get disposed() {
        return isShuttingDown(node);
      },
    };
    Object.freeze(ctx);

    try {
      if (ownerNode !== null) {
        if (isShuttingDown(ownerNode)) {
          throw new Error("Cannot create a model under a closed owner.");
        }
        adoptOwnershipNode(ownerNode, node);
      }
      return runBatch(() =>
        untracked(() => {
          const shape = runWithOwner(owner, node, () => setup(ctx, ...args));
          const namespaces = validateShape(shape);
          const dispose = () => {
            if (!isShuttingDown(node))
              runCleanup(() => disposeOwnershipNode(node));
          };
          Object.defineProperties(shape, {
            dispose: { value: dispose },
            disposed: { get: () => isShuttingDown(node) },
            [Symbol.dispose]: { value: dispose },
          });
          const model = shape as Model<Shape>;
          Object.defineProperty(model, MODEL_NODE, { value: node });
          markCapability(model, MODEL_TYPE);
          for (const namespace of namespaces) Object.freeze(namespace);
          return model;
        }),
      );
    } catch (cause) {
      return runCleanup(() => {
        disposeOwnershipNode(node);
        throw cause;
      });
    }
  };
}

/** Compatibility helper for adopting a disposable resource through a model context. */
export function own<T extends DisposableResource>(
  ctx: ModelContext,
  resource: LifecycleHandle<T>,
): T;
export function own<T extends DisposableResource>(
  ctx: ModelContext,
  resource: T,
): T;
export function own(
  ctx: ModelContext,
  resource: DisposableResource,
): DisposableResource {
  return ctx.own(resource as never) as DisposableResource;
}
