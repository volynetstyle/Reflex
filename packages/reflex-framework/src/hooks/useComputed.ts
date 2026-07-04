import {
  createDisposableComputed,
  warmDisposableComputed,
  type DisposableComputed,
} from "@volynets/reflex";
import { assertHookUsage } from "./context";
import { type HookSlot, isHookSlotDisposed, useHookSlot } from "./slot";

interface GuardedReadable<T> {
  computed: DisposableComputed<T>;
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
  const slot = useHookSlot<GuardedReadable<T>>(
    () => {
      // Component hooks do not rerender in place today: the first render owns
      // this closure until its ownership node is disposed, so stale fn capture is the
      // intended lifecycle contract rather than a missed dependency update.
      const computed = createDisposableComputed(fn);
      const state: GuardedReadable<T> = {
        computed,
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
      state.computed.dispose();
    },
  );

  const readable = slot.value;
  readable.guarded ??= bindSlot(slot);

  return readable.guarded;
}

function bindSlot<T>(slot: HookSlot<GuardedReadable<T>>): Computed<T> {
  const guarded = (() => readGuarded(slot, slot.value)) as Computed<T>;

  Object.defineProperty(guarded, "value", {
    configurable: true,
    enumerable: true,
    get() {
      return guarded();
    },
  });

  return guarded;
}

function readGuarded<T>(
  slot: HookSlot<GuardedReadable<T>>,
  state: GuardedReadable<T>,
): T {
  if (isHookSlotDisposed(slot)) {
    if (state.hasValue) return state.value as T;
    throw new Error("Cannot read disposed computed hook before initialization.");
  }

  const value = state.computed.read();
  state.value = value;
  state.hasValue = true;
  return value;
}
