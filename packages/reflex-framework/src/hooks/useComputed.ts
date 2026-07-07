import {
  createConsumer,
  readConsumerLazy,
  untracked,
} from "@volynets/reflex-runtime";
import { disposeNode } from "@volynets/reflex-runtime/internal";
import type { Computed, Memo } from "../types/core";
import { assertHookUsage } from "./context";
import { useOwned } from "./useOwned";

export interface DisposableComputed<T> {
  readonly read: Computed<T>;
  dispose(): void;
}

export function createDisposableComputed<T>(
  fn: () => T,
): DisposableComputed<T> {
  const node = createConsumer(fn);
  const read = readConsumerLazy.bind(node) as Computed<T>;

  return {
    read,
    dispose() {
      disposeNode(node);
    },
  };
}

export function warmDisposableComputed<T>(computed: DisposableComputed<T>): T {
  return untracked(computed.read);
}

interface GuardedReadable<T> {
  readonly node: ReturnType<typeof createConsumer<T>>;
  readonly read: Computed<T>;

  disposed: boolean;
  hasValue: boolean;
  value: T | undefined;

  guarded: Computed<T>;
}

export function useComputed<T>(fn: () => T): Computed<T> {
  assertHookUsage("useComputed");
  assertHookUsage("useMemo");
  const state = useOwned<GuardedReadable<T>>(
    () => createGuardedReadable(fn, false),
    disposeGuardedReadable,
  );

  return state.guarded;
}

export function useMemo<T>(fn: () => T): Memo<T> {
  assertHookUsage("useMemo");
  const state = useOwned<GuardedReadable<T>>(
    () => createGuardedReadable(fn, true),
    disposeGuardedReadable,
  );

  return state.guarded;
}

function createGuardedReadable<T>(
  fn: () => T,
  warm: boolean,
): GuardedReadable<T> {
  const node = createConsumer(fn);
  const read = readConsumerLazy.bind(node) as Computed<T>;

  const state: GuardedReadable<T> = {
    node,
    read,

    disposed: false,
    hasValue: false,
    value: undefined,

    guarded: undefined as unknown as Computed<T>,
  };

  state.guarded = bindState(state);

  try {
    if (warm) {
      state.value = untracked(read);
      state.hasValue = true;
    }

    return state;
  } catch (error) {
    disposeNode(node);
    throw error;
  }
}

function disposeGuardedReadable<T>(state: GuardedReadable<T>): void {
  state.disposed = true;
  disposeNode(state.node);
}

function bindState<T>(state: GuardedReadable<T>): Computed<T> {
  const guarded = (() => readGuarded(state)) as Computed<T>;

  Object.defineProperty(guarded, "value", {
    configurable: true,
    enumerable: true,
    get() {
      return guarded();
    },
  });

  return guarded;
}

function readGuarded<T>(state: GuardedReadable<T>): T {
  if (state.disposed) {
    return readDisposed(state);
  }

  const value = state.read();

  state.value = value;

  if (!state.hasValue) {
    state.hasValue = true;
  }

  return value;
}

function readDisposed<T>(state: GuardedReadable<T>): T {
  if (state.hasValue) {
    return state.value as T;
  }

  throw new Error("Cannot read disposed computed hook before initialization.");
}
