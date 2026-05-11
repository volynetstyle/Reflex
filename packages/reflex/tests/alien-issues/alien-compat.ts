import { getActiveConsumer } from "@volynets/reflex-runtime";
import type { ReactiveNode } from "@volynets/reflex-runtime";
import { computed } from "../../src/api/derived";
import { effect as reflexEffect } from "../../src/api/effect";
import { createRuntime } from "../../src/infra/runtime";
import { signal as reflexSignal } from "../../src/api/signal";

export type AlienSignal<T> = {
  (): T;
  (value: T): void;
};

type ScopeFrame = Destructor[];

const scopeStack: ScopeFrame[] = [];

export function setupAlienRuntime() {
  return createRuntime({ effectStrategy: "eager" });
}

export function signal<T>(initialValue: T): AlienSignal<T> {
  const [read, write] = reflexSignal(initialValue);

  return (function (value?: T) {
    if (arguments.length === 0) {
      return read();
    }

    write(value as T);
  }) as AlienSignal<T>;
}

export { computed };

export function effect(fn: EffectFn): Destructor {
  const dispose = reflexEffect(fn);
  const frame = scopeStack.at(-1);

  if (frame !== undefined) {
    frame.push(dispose);
  }

  return dispose;
}

export function effectScope(fn: () => void): Destructor {
  const frame: ScopeFrame = [];
  scopeStack.push(frame);

  try {
    fn();
  } finally {
    scopeStack.pop();
  }

  return () => {
    for (let i = frame.length - 1; i >= 0; --i) {
      frame[i]();
    }
  };
}

export function getActiveSub(): ReactiveNode | null {
  return getActiveConsumer();
}
