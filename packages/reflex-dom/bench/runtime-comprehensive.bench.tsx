/** @jsxImportSource ../src */

import { bench, describe } from "vitest";
import { For, useSignal } from "../src";
import {
  createDOMExecutionContext,
  dispatchDOMEvent,
  ensureDOMRuntime,
  runDOMOperation,
  runWithDOMExecutionContext,
  type DOMExecutionContext,
} from "../src/runtime/execution";
import { createDOMRenderer, type DOMRenderer } from "../src/runtime/renderer";

const BOUNDARY_OPERATIONS = 1_024;
const EVENT_OPERATIONS = 256;
const KEYED_UPDATES = 32;
const noop = (): void => {};

function assertMultiple(value: number, divisor: number, label: string): void {
  if (value === 0 || value % divisor !== 0) {
    throw new Error(
      `${label}: expected a non-zero multiple of ${divisor}, got ${value}`,
    );
  }
}

function legacyRunDOMOperation<T>(
  context: DOMExecutionContext,
  fn: () => T,
): T {
  return ensureDOMRuntime(context).batch(() =>
    runWithDOMExecutionContext(context, fn),
  );
}

describe("DOM execution boundary | before vs after", () => {
  let context: DOMExecutionContext;

  bench(
    "after | scoped globals",
    () => {
      for (let index = 0; index < BOUNDARY_OPERATIONS; ++index) {
        runDOMOperation(context, noop);
      }
    },
    {
      setup() {
        context = createDOMExecutionContext();
        ensureDOMRuntime(context);
      },
    },
  );

  bench(
    "before | callback wrappers",
    () => {
      for (let index = 0; index < BOUNDARY_OPERATIONS; ++index) {
        legacyRunDOMOperation(context, noop);
      }
    },
    {
      setup() {
        context = createDOMExecutionContext();
        ensureDOMRuntime(context);
      },
    },
  );
});

describe("DOM event dispatch | before vs after", () => {
  let context: DOMExecutionContext;
  let receiver: HTMLButtonElement;
  let event: Event;
  let handled = 0;
  const handler = function (this: Element): void {
    if (this !== receiver) throw new Error("event receiver was not preserved");
    handled += 1;
  };

  bench(
    "after | argument slots",
    () => {
      for (let index = 0; index < EVENT_OPERATIONS; ++index) {
        dispatchDOMEvent(context, handler, receiver, event);
      }
    },
    {
      setup() {
        context = createDOMExecutionContext();
        ensureDOMRuntime(context);
        receiver = document.createElement("button");
        event = new Event("click");
        handled = 0;
      },
      teardown() {
        assertMultiple(handled, EVENT_OPERATIONS, "scoped event dispatch");
      },
    },
  );

  bench(
    "before | per-event invoke closure",
    () => {
      for (let index = 0; index < EVENT_OPERATIONS; ++index) {
        legacyRunDOMOperation(context, () => handler.call(receiver, event));
      }
    },
    {
      setup() {
        context = createDOMExecutionContext();
        ensureDOMRuntime(context);
        receiver = document.createElement("button");
        event = new Event("click");
        handled = 0;
      },
      teardown() {
        assertMultiple(handled, EVENT_OPERATIONS, "legacy event dispatch");
      },
    },
  );
});

describe("End-to-end DOM regression", () => {
  const forward = Array.from({ length: 64 }, (_, id) => ({
    id,
    label: String(id),
  }));
  const reverse = [...forward].reverse();
  let renderer: DOMRenderer;
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;
  let setItems: ReturnType<typeof useSignal<typeof forward>>;
  let reversed = false;

  function KeyedView() {
    const items = useSignal(forward);
    setItems = items;
    return (
      <ul>
        <For each={items} by={(item) => item.id}>
          {(item) => <li>{item.label}</li>}
        </For>
      </ul>
    );
  }

  bench(
    "current | keyed 64-row reversal",
    () => {
      for (let index = 0; index < KEYED_UPDATES; ++index) {
        reversed = !reversed;
        runDOMOperation(
          renderer.execution,
          setItems,
          reversed ? reverse : forward,
        );
      }
    },
    {
      setup() {
        renderer = createDOMRenderer();
        container = document.createElement("div");
        reversed = false;
        dispose = renderer.render(<KeyedView />, container);
      },
      teardown() {
        const expected = (reversed ? reverse : forward)
          .map((item) => item.label)
          .join("");
        if (container.textContent !== expected) {
          throw new Error("keyed reconciliation produced incorrect DOM");
        }
        dispose?.();
      },
    },
  );
});
