import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";
import { createProjection, createSelector } from "../src/unstable";

describe("Reactive system - unstable selector/projection", () => {
  it("createSelector reruns only the previously selected and next selected keys", () => {
    const rt = createRuntime();
    const [selected, setSelected] = signal("a");
    const isSelected = createSelector(selected);
    const seen: string[] = [];

    effect(() => {
      seen.push(`a:${String(isSelected("a"))}`);
    });
    effect(() => {
      seen.push(`b:${String(isSelected("b"))}`);
    });
    effect(() => {
      seen.push(`c:${String(isSelected("c"))}`);
    });

    expect(seen).toEqual(["a:true", "b:false", "c:false"]);

    setSelected("b");
    rt.flush();

    expect(seen).toEqual([
      "a:true",
      "b:false",
      "c:false",
      "a:false",
      "b:true",
    ]);

    setSelected("c");
    rt.flush();

    expect(seen).toEqual([
      "a:true",
      "b:false",
      "c:false",
      "a:false",
      "b:true",
      "b:false",
      "c:true",
    ]);
  });

  it("createProjection updates only the active key and the previously active key", () => {
    const rt = createRuntime();
    const [source, setSource] = signal({ id: "a", label: "one" });
    const projectLabel = createProjection(source, (value) => value.id, (value) => value.label);
    const seen: string[] = [];

    effect(() => {
      seen.push(`a:${String(projectLabel("a"))}`);
    });
    effect(() => {
      seen.push(`b:${String(projectLabel("b"))}`);
    });
    effect(() => {
      seen.push(`c:${String(projectLabel("c"))}`);
    });

    expect(seen).toEqual(["a:one", "b:undefined", "c:undefined"]);

    setSource({ id: "a", label: "two" });
    rt.flush();

    expect(seen).toEqual([
      "a:one",
      "b:undefined",
      "c:undefined",
      "a:two",
    ]);

    setSource({ id: "b", label: "three" });
    rt.flush();

    expect(seen).toEqual([
      "a:one",
      "b:undefined",
      "c:undefined",
      "a:two",
      "a:undefined",
      "b:three",
    ]);
  });

  it("can be composed through computed without tracking the whole source as one dependency", () => {
    createRuntime({ effectStrategy: "eager" });
    const [selected, setSelected] = signal(1);
    const isSelected = createSelector(selected);
    let runs = 0;

    const branch = computed(() => {
      runs += 1;
      return isSelected(2) ? "two" : "other";
    });

    expect(branch()).toBe("other");
    expect(runs).toBe(1);

    setSelected(3);
    expect(branch()).toBe("other");
    expect(runs).toBe(1);

    setSelected(2);
    expect(branch()).toBe("two");
    expect(runs).toBe(2);
  });

  it("integrates with ranked scheduling via sync watcher priority", () => {
    const rt = createRuntime({ effectStrategy: "ranked" });
    const [selected, setSelected] = signal("a");
    const isSelected = createSelector(selected, { priority: 100 });
    const seen: string[] = [];

    effect(() => {
      seen.push(`view:${isSelected("b") ? "b" : "other"}`);
    });

    expect(seen).toEqual(["view:other"]);

    setSelected("b");
    rt.flush();

    expect(seen).toEqual(["view:other", "view:b"]);
  });
});

describe("Projection basics", () => {
  it("should observe key changes", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(0);
    const selected = createProjection(
      source,
      (value) => value,
      (value) => value === value,
      { fallback: false },
    );

    const effect0 = vi.fn(() => selected(0));
    const effect1 = vi.fn(() => selected(1));
    const effect2 = vi.fn(() => selected(2));

    const memo0 = computed(effect0);
    const memo1 = computed(effect1);
    const memo2 = computed(effect2);

    expect(memo0()).toBe(true);
    expect(memo1()).toBe(false);
    expect(memo2()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(1);
    expect(effect1).toHaveBeenCalledTimes(1);
    expect(effect2).toHaveBeenCalledTimes(1);

    setSource(1);
    rt.flush();

    expect(memo0()).toBe(false);
    expect(memo1()).toBe(true);
    expect(memo2()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(2);
    expect(effect2).toHaveBeenCalledTimes(1);

    setSource(2);
    rt.flush();

    expect(memo0()).toBe(false);
    expect(memo1()).toBe(false);
    expect(memo2()).toBe(true);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(2);

    setSource(-1);
    rt.flush();

    expect(memo0()).toBe(false);
    expect(memo1()).toBe(false);
    expect(memo2()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(3);
  });

  it("should not self track", () => {
    const rt = createRuntime();
    const spy = vi.fn();
    const [bar, setBar] = signal("foo");
    const projection = createProjection(
      bar,
      (value) => value,
      (value) => value,
      { fallback: undefined },
    );

    const fooView = computed(() => {
      spy();
      return projection("foo");
    });
    const bazView = computed(() => projection("baz"));

    expect(fooView()).toBe("foo");
    expect(bazView()).toBe(undefined);
    expect(spy).toHaveBeenCalledTimes(1);

    setBar("baz");
    rt.flush();

    expect(fooView()).toBe(undefined);
    expect(bazView()).toBe("baz");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("should work for chained projections", () => {
    const rt = createRuntime();
    const [x, setX] = signal(1);
    const tmp = vi.fn();

    const a = createProjection(x, () => "v", (value) => value, { fallback: 0 });
    const b = createProjection(
      () => a("v") ?? 0,
      () => "v",
      (value) => value,
      { fallback: 0 },
    );

    let previous: number | undefined;
    effect(() => {
      const value = b("v");
      tmp(value, previous);
      previous = value;
    });

    expect(tmp).toBeCalledTimes(1);
    expect(tmp).toBeCalledWith(1, undefined);

    tmp.mockReset();
    setX(2);
    rt.flush();

    expect(tmp).toBeCalledTimes(1);
    expect(tmp).toBeCalledWith(2, 1);
  });

  it("should fork a signal values", () => {
    const rt = createRuntime();
    const [x, setX] = signal<{ v: number; y?: number }>({ v: 1 });
    const tmp = vi.fn();
    const projection = createProjection(
      x,
      (_value) => "state",
      (value) => value,
      { fallback: undefined },
    );

    let prevV: number | undefined;
    let prevY: number | undefined;
    effect(() => {
      const next = projection("state");
      tmp(next?.v, prevV);
      prevV = next?.v;
    });
    effect(() => {
      const next = projection("state");
      tmp(next?.y, prevY);
      prevY = next?.y;
    });

    expect(tmp).toBeCalledTimes(2);
    expect(tmp).toHaveBeenNthCalledWith(1, 1, undefined);
    expect(tmp).toHaveBeenNthCalledWith(2, undefined, undefined);
    tmp.mockReset();

    setX({ v: 2 });
    rt.flush();

    expect(tmp).toBeCalledTimes(2);
    expect(tmp).toHaveBeenNthCalledWith(1, 2, 1);
    expect(tmp).toHaveBeenNthCalledWith(2, undefined, undefined);
    tmp.mockReset();

    setX({ v: 2, y: 3 });
    rt.flush();

    expect(tmp).toBeCalledTimes(2);
    expect(tmp).toHaveBeenNthCalledWith(1, 2, 2);
    expect(tmp).toHaveBeenNthCalledWith(2, 3, undefined);
  });
});

describe("selection with projections", () => {
  it("simple selection", () => {
    const rt = createRuntime();
    const [selected, setSelected] = signal<number | undefined>(undefined);
    const counts = Array.from({ length: 100 }, () => 0);
    const list: Array<string> = [];

    const isSelected = createSelector(selected);

    const views = Array.from({ length: 100 }, (_, i) =>
      computed(() => {
        counts[i] += 1;
        const value = isSelected(i) ? "selected" : "no";
        list[i] = value;
        return value;
      }),
    );

    for (let i = 0; i < views.length; ++i) {
      views[i]!();
    }

    expect(list[3]).toBe("no");

    setSelected(3);
    rt.flush();
    views[3]!();
    expect(list[3]).toBe("selected");
    expect(counts[3]).toBe(2);

    setSelected(6);
    rt.flush();
    views[3]!();
    views[6]!();
    expect(list[3]).toBe("no");
    expect(list[6]).toBe("selected");

    setSelected(undefined);
    rt.flush();
    views[6]!();
    expect(list[6]).toBe("no");

    setSelected(5);
    rt.flush();
    views[5]!();
    expect(list[5]).toBe("selected");
  });

  it("double selection", () => {
    const rt = createRuntime();
    const [selected, setSelected] = signal<number | undefined>(undefined);
    let count = 0;
    const list: Array<string>[] = [];

    const isSelected = createSelector(selected);

    const firstViews = Array.from({ length: 100 }, (_, i) => {
      list[i] = [];
      return computed(() => {
        count += 1;
        list[i][0] = isSelected(i) ? "selected" : "no";
        return list[i][0];
      });
    });
    const secondViews = Array.from({ length: 100 }, (_, i) =>
      computed(() => {
        count += 1;
        list[i][1] = isSelected(i) ? "oui" : "non";
        return list[i][1];
      }),
    );

    for (let i = 0; i < firstViews.length; ++i) {
      firstViews[i]!();
      secondViews[i]!();
    }

    expect(count).toBe(200);
    expect(list[3][0]).toBe("no");
    expect(list[3][1]).toBe("non");
    count = 0;

    setSelected(3);
    rt.flush();
    firstViews[3]!();
    secondViews[3]!();
    expect(count).toBe(2);
    expect(list[3][0]).toBe("selected");
    expect(list[3][1]).toBe("oui");

    count = 0;
    setSelected(6);
    rt.flush();
    firstViews[3]!();
    secondViews[3]!();
    firstViews[6]!();
    secondViews[6]!();
    expect(count).toBe(4);
    expect(list[3][0]).toBe("no");
    expect(list[6][0]).toBe("selected");
    expect(list[3][1]).toBe("non");
    expect(list[6][1]).toBe("oui");
  });
});
