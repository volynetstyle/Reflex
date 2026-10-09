/** @jsxImportSource ../src */
import { getActiveRuntimeContext } from "@volynets/reflex-runtime";
import type { SignalAccessor } from "@volynets/reflex-framework";
import { describe, expect, it } from "vitest";
import {
  createDOMRenderer,
  isModelActionValue,
  isModelReadableValue,
  renderToString,
  useSignal,
} from "../src";

describe("DOM signal write binding", () => {
  it("preserves undefined reads, updater writes, callable identity, and capability shape", () => {
    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    let value!: SignalAccessor<number | undefined>;
    function View() {
      value = useSignal<number | undefined>(undefined);
      return <p>{() => value() ?? "empty"}</p>;
    }
    const dispose = renderer.render(<View />, container);
    const identity = value;
    try {
      expect(typeof value).toBe("function");
      expect(isModelReadableValue(value)).toBe(false);
      expect(isModelActionValue(value)).toBe(false);
      expect(value()).toBeUndefined();
      expect(value("ready")).toBe("ready");
      expect(value(undefined)).toBe("ready");
      expect(value(() => undefined)).toBeUndefined();
      expect(value).toBe(identity);
      expect(container.textContent).toBe("empty");
    } finally {
      dispose();
    }
  });

  it.each(["eager", "sab", "flush"] as const)(
    "enters its runtime for promise callbacks with %s delivery",
    async (effectStrategy) => {
      const renderer = createDOMRenderer({ effectStrategy });
      const container = document.createElement("div");
      let count!: SignalAccessor<number>;
      function View() {
        count = useSignal(0);
        return <p>{count}</p>;
      }
      const dispose = renderer.render(<View />, container);
      const previousRuntime = getActiveRuntimeContext();
      try {
        await Promise.resolve().then(() => {
          expect(count(1)).toBe(1);
          expect(
            count((previous) => {
              expect(getActiveRuntimeContext()).toBe(
                renderer.execution.runtime.execution,
              );
              return previous + 2;
            }),
          ).toBe(3);
          expect(getActiveRuntimeContext()).toBe(previousRuntime);
          expect(container.textContent).toBe(
            effectStrategy === "eager" ? "3" : "0",
          );
        });
        if (effectStrategy === "sab") {
          // Binding a write does not add the batch boundary SAB waits for.
          expect(container.textContent).toBe("0");
          renderer.batch(() => count((previous) => previous + 1));
          expect(container.textContent).toBe("4");
        } else {
          expect(container.textContent).toBe("3");
        }
      } finally {
        dispose();
      }
    },
  );

  it("uses the captured renderer when another runtime is active", async () => {
    const left = createDOMRenderer();
    const right = createDOMRenderer({ effectStrategy: "flush" });
    const leftContainer = document.createElement("div");
    const rightContainer = document.createElement("div");
    let leftCount!: SignalAccessor<number>;
    let rightCount!: SignalAccessor<number>;
    function Left() {
      leftCount = useSignal(0);
      return <p>{leftCount}</p>;
    }
    function Right() {
      rightCount = useSignal(0);
      return <p>{rightCount}</p>;
    }
    const disposeLeft = left.render(<Left />, leftContainer);
    const disposeRight = right.render(<Right />, rightContainer);
    const previousRuntime = getActiveRuntimeContext();
    try {
      left.run(() => {
        rightCount((previous) => {
          expect(getActiveRuntimeContext()).toBe(
            right.execution.runtime.execution,
          );
          return previous + 1;
        });
        expect(getActiveRuntimeContext()).toBe(
          left.execution.runtime.execution,
        );
        leftCount(2);
      });
      expect(getActiveRuntimeContext()).toBe(previousRuntime);
      expect(leftContainer.textContent).toBe("2");
      expect(rightContainer.textContent).toBe("0");
      await Promise.resolve();
      expect(leftContainer.textContent).toBe("2");
      expect(rightContainer.textContent).toBe("1");
    } finally {
      disposeLeft();
      disposeRight();
    }
  });

  it("writes through renderer A when its setter is called during renderer B", async () => {
    const left = createDOMRenderer({ effectStrategy: "flush" });
    const right = createDOMRenderer({ effectStrategy: "eager" });
    const leftContainer = document.createElement("div");
    const rightContainer = document.createElement("div");
    let leftCount!: SignalAccessor<number>;
    function Left() {
      leftCount = useSignal(0);
      return <p>{leftCount}</p>;
    }
    function Right() {
      return <span>right</span>;
    }
    const disposeLeft = left.render(<Left />, leftContainer);
    const disposeRight = right.render(<Right />, rightContainer);
    try {
      right.run(() => {
        leftCount(1);
        expect(getActiveRuntimeContext()).toBe(
          right.execution.runtime.execution,
        );
      });
      expect(rightContainer.textContent).toBe("right");
      expect(leftContainer.textContent).toBe("0");
      await Promise.resolve();
      expect(leftContainer.textContent).toBe("1");
    } finally {
      disposeLeft();
      disposeRight();
    }
  });

  it("rejects reactive reads of renderer A signals from renderer B", () => {
    const left = createDOMRenderer();
    const right = createDOMRenderer();
    const leftContainer = document.createElement("div");
    const rightContainer = document.createElement("div");
    let leftCount!: SignalAccessor<number>;
    function Left() {
      leftCount = useSignal(0);
      return <p>{leftCount}</p>;
    }
    function Right() {
      return <span>{leftCount}</span>;
    }
    const disposeLeft = left.render(<Left />, leftContainer);
    try {
      expect(() => right.render(<Right />, rightContainer)).toThrow(
        "A DOM signal cannot be read by a reactive computation in another runtime.",
      );
      expect(rightContainer.childNodes).toHaveLength(0);
    } finally {
      disposeLeft();
    }
  });

  it("restores the caller's runtime when a functional updater throws", () => {
    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    let count!: SignalAccessor<number>;
    function View() {
      count = useSignal(0);
      return <p>{count}</p>;
    }
    const dispose = renderer.render(<View />, container);
    const previousRuntime = getActiveRuntimeContext();
    const error = new Error("update failed");
    try {
      expect(() =>
        count(() => {
          throw error;
        }),
      ).toThrow(error);
      expect(getActiveRuntimeContext()).toBe(previousRuntime);
      expect(container.textContent).toBe("0");
      count(2);
      expect(container.textContent).toBe("2");
    } finally {
      dispose();
    }
  });

  it("keeps signal components usable during server rendering", () => {
    function View() {
      const count = useSignal(1);
      return <p>{count}</p>;
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(<View />);
    expect(container.textContent).toBe("1");
  });
});
