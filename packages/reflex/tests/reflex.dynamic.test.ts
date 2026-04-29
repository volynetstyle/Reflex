import { beforeEach, describe, expect, it } from "vitest";
import { setup } from "./reflex.test_utils";

describe("Reactive system - dynamic dependencies", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];
  let rt: ReturnType<typeof setup>["rt"];

  beforeEach(() => {
    ({ rt, signal, computed } = setup());
  });

  it("switches branches and follows the active dependency", () => {
    const [flag, setFlag] = signal(true);
    const [left, setLeft] = signal(1);
    const [right, setRight] = signal(10);

    const selected = computed(() => (flag() ? left() : right()));

    expect(selected()).toBe(1);

    setFlag(false);
    expect(selected()).toBe(10);

    setLeft(2);
    expect(selected()).toBe(10);

    setRight(20);
    expect(selected()).toBe(20);
  });

  it("supports repeated reads of the same source in one computation", () => {
    const [value, setValue] = signal(2);
    const total = computed(() => value() + value() + value());

    expect(total()).toBe(6);

    setValue(3);
    expect(total()).toBe(9);
  });

  it("keeps downstream propagation safe while dynamic dependencies switch in batches", () => {
    const [selector, setSelector] = signal(0);
    const [left, setLeft] = signal(1);
    const [right, setRight] = signal(2);

    const selected = computed(() =>
      selector() % 2 === 0 ? left() : right(),
    );
    const plusOne = computed(() => selected() + 1);
    const doubled = computed(() => plusOne() * 2);

    expect(doubled()).toBe(4);

    for (let i = 1; i <= 10_000; i++) {
      rt.batch(() => {
        setSelector(i);
        if (i % 2 === 0) setLeft(i);
        else setRight(i);
        expect(doubled()).toBe((i + 1) * 2);
      });
    }
  });
});
