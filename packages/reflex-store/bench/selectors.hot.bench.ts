import { bench, describe } from "vitest";
import { createRuntime, effect, signal } from "@volynets/reflex";
import {
  createKeyedProjection,
  createSelector,
  createStoreProjection,
} from "../src";

const runtime = createRuntime({ effectStrategy: "flush" });

for (const subscriberCount of [2, 100, 1_000]) {
  const [selected, setSelected] = signal(0);
  const isSelected = createSelector(selected);
  const stops = Array.from({ length: subscriberCount }, (_, key) =>
    effect(() => {
      isSelected(key);
    }),
  );
  let next = 1;

  describe(`selector hot path: ${subscriberCount} keys`, () => {
    bench("transition previous -> next", () => {
      setSelected(next);
      next ^= 1;
      runtime.flush();
    });

    bench("same-key no-op", () => {
      setSelected(next ^ 1);
      runtime.flush();
    });
  });

  void stops;
}

{
  const [source, setSource] = signal({ id: 0, value: 0 });
  const projected = createKeyedProjection(
    source,
    (value) => value.id,
    (value) => value.value,
  );
  const stop0 = effect(() => {
    void projected(0);
  });
  const stop1 = effect(() => {
    void projected(1);
  });
  let value = 0;

  describe("keyed projection hot path", () => {
    bench("same key, changed projected value", () => {
      value++;
      setSource({ id: value & 1, value });
      runtime.flush();
    });

    bench("materialized key read", () => {
      projected(value & 1);
    });
  });

  void stop0;
  void stop1;
}

{
  const [source, setSource] = signal({ hot: 0, stable: 1 });
  const store = createStoreProjection(
    (draft: { hot: number; stable: number }) => {
      const value = source();
      draft.hot = value.hot;
      draft.stable = value.stable;
    },
    { hot: 0, stable: 1 },
  );
  const stopHot = effect(() => void store.hot);
  const stopStable = effect(() => void store.stable);
  let hot = 0;

  describe("store projection hot path", () => {
    bench("one changed, one stable field", () => {
      setSource({ hot: ++hot, stable: 1 });
      runtime.flush();
    });

    bench("leaf property read", () => {
      void store.hot;
    });
  });

  void stopHot;
  void stopStable;
}
