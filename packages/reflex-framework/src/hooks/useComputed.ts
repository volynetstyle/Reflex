import {
  createConsumer,
  readConsumerLazy,
  untracked,
} from "@volynets/reflex-runtime";
import { assertHookUsage } from "./context";
import { useOwned } from "./useOwned";
import { disposeNode } from "@runtime/kernel";

export interface DisposableComputed<T> {
  readonly read: Computed<T>;
  dispose(): void;
}

export function createDisposableComputed<T>(
  fn: () => T,
): DisposableComputed<T> {
  // devassertDerivedFn(fn, "computed");

  const node = createConsumer(fn);

  return {
    read: readConsumerLazy.bind(node) as Computed<T>,
    dispose() {
      disposeNode(node);
    },
  };
}

export function warmDisposableComputed<T>(computed: DisposableComputed<T>): T {
  return untracked(computed.read);
}

interface GuardedReadable<T> {
  computed: DisposableComputed<T>;
  disposed: boolean;
  guarded: Computed<T> | null;
  hasValue: boolean;
  value: T | undefined;
}

export function useComputed<T>(fn: () => T): Computed<T> {
  assertHookUsage("useComputed");
  return useDerived(fn, false);
}

export function useMemo<T>(fn: () => T): Memo<T> {
  assertHookUsage("useMemo");
  return useDerived(fn, true) as Memo<T>;
}

function useDerived<T>(fn: () => T, warm: boolean): Computed<T> {
  const state = useOwned<GuardedReadable<T>>(
    () => {
      // Component hooks do not rerender in place today: the first render owns
      // this closure until its ownership node is disposed, so stale fn capture is the
      // intended lifecycle contract rather than a missed dependency update.
      const computed = createDisposableComputed(fn);
      const state: GuardedReadable<T> = {
        computed,
        disposed: false,
        guarded: null,
        hasValue: false,
        value: undefined,
      };

      if (warm) {
        state.value = warmDisposableComputed(computed);
        state.hasValue = true;
      }

      return state;
    },
    (state) => {
      state.disposed = true;
      state.computed.dispose();
    },
  );

  state.guarded ??= bindState(state);

  return state.guarded;
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
    if (state.hasValue) return state.value as T;
    throw new Error(
      "Cannot read disposed computed hook before initialization.",
    );
  }

  const value = state.computed.read();
  state.value = value;
  state.hasValue = true;
  return value;
}
