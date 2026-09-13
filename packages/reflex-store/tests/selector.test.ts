import { describe, expect, it, vi } from "vitest";
import {
  computed,
  createRuntime,
  effect,
  signal,
} from "../../reflex/tests/reflex.test_utils";
import {
  createKeyedProjection,
  createProjection,
  createSelector,
  createStoreProjection,
} from "../src";

describe("Reactive system - unstable selector/projection", () => {
  it("createSelector reruns only the previously selected and next selected keys", () => {
    const rt = createRuntime();
    const selected = signal("a");
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

    selected.set("b");
    rt.flush();

    expect(seen).toEqual([
      "a:true",
      "b:false",
      "c:false",
      "a:false",
      "b:true",
    ]);

    selected.set("c");
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
    const source = signal({ id: "a", label: "one" });
    const projectLabel = createKeyedProjection(
      source,
      (value) => value.id,
      (value) => value.label,
    );
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

    source.set({ id: "a", label: "two" });
    rt.flush();

    expect(seen).toEqual([
      "a:one",
      "b:undefined",
      "c:undefined",
      "a:two",
    ]);

    source.set({ id: "b", label: "three" });
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
    const selected = signal(1);
    const isSelected = createSelector(selected);
    let runs = 0;

    const branch = computed(() => {
      runs += 1;
      return isSelected(2) ? "two" : "other";
    });

    expect(branch()).toBe("other");
    expect(runs).toBe(1);

    selected.set(3);
    expect(branch()).toBe("other");
    expect(runs).toBe(1);

    selected.set(2);
    expect(branch()).toBe("two");
    expect(runs).toBe(2);
  });

  it("integrates with flush scheduling", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
    const selected = signal("a");
    const isSelected = createSelector(selected);
    const seen: string[] = [];

    effect(() => {
      seen.push(`view:${isSelected("b") ? "b" : "other"}`);
    });

    expect(seen).toEqual(["view:other"]);

    selected.set("b");
    rt.flush();

    expect(seen).toEqual(["view:other", "view:b"]);
  });

  it("shares one semantic key node when custom equality is used", () => {
    const rt = createRuntime();
    const selected = signal({ id: 1 });
    const isSelected = createSelector(selected, {
      equals: (left, right) => left.id === right.id,
    });
    const seen: boolean[] = [];

    effect(() => {
      seen.push(isSelected({ id: 1 }));
    });

    selected.set({ id: 2 });
    rt.flush();

    expect(seen).toEqual([true, false]);
    expect(isSelected({ id: 2 })).toBe(true);
  });

  it("updates same-key projections before views observe them", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
    const source = signal({ id: "a", label: "one" });
    const labels = createProjection(
      source,
      (value) => value.id,
      (value) => value.label,
    );
    const seen: string[] = [];

    effect(
      () => {
        seen.push(String(labels("a")));
      },
    );

    expect(seen).toEqual(["one"]);

    source.set({ id: "a", label: "two" });
    rt.flush();

    expect(seen).toEqual(["one", "two"]);
  });

  it("supports semantic equality at the projected-value boundary", () => {
    const rt = createRuntime();
    const source = signal({ id: "a", version: 1, label: "one" });
    const labels = createProjection(
      source,
      (value) => value.id,
      (value) => ({ version: value.version, label: value.label }),
      {
        equals: (left, right) => left.version === right.version,
      },
    );
    let runs = 0;

    effect(() => {
      void labels("a");
      runs++;
    });

    source.set({ id: "a", version: 1, label: "equivalent" });
    rt.flush();
    expect(runs).toBe(1);

    source.set({ id: "a", version: 2, label: "changed" });
    rt.flush();
    expect(runs).toBe(2);
  });
});

describe("Store-style projection", () => {
  it("derives a mutable draft from reactive sources", () => {
    const rt = createRuntime();
    const first = signal("Ada");
    const last = signal("Lovelace");
    const user = createProjection<{ fullName: string; initials: string }>(
      (draft) => {
        draft.fullName = `${first()} ${last()}`;
        draft.initials = `${first()[0]}${last()[0]}`;
      },
      { fullName: "", initials: "" },
    );
    const seen: string[] = [];

    effect(() => {
      seen.push(`${user.fullName}|${user.initials}`);
    });

    expect(seen).toEqual(["Ada Lovelace|AL"]);

    last.set("Byron");
    rt.flush();

    expect(seen).toEqual(["Ada Lovelace|AL", "Ada Byron|AB"]);
  });

  it("can replace the projected store by returning a new object", () => {
    const rt = createRuntime();
    const count = signal(1);
    const stats = createStoreProjection(
      () => ({
        count: count(),
        doubled: count() * 2,
      }),
      { count: 0, doubled: 0 },
    );

    expect(stats.count).toBe(1);
    expect(stats.doubled).toBe(2);

    count.set(3);
    rt.flush();

    expect(stats.count).toBe(3);
    expect(stats.doubled).toBe(6);
  });

  it("tracks nested property reads through the store proxy", () => {
    const rt = createRuntime();
    const theme = signal("light");
    const settings = createProjection<{ ui: { theme: string; density: string } }>(
      (draft) => {
        draft.ui = { theme: theme(), density: "compact" };
      },
      { ui: { theme: "light", density: "compact" } },
    );
    const seen: string[] = [];

    effect(() => {
      seen.push(settings.ui.theme);
    });

    expect(seen).toEqual(["light"]);

    theme.set("dark");
    rt.flush();

    expect(seen).toEqual(["light", "dark"]);
  });

  it("updates only affected record keys for store projections", () => {
    const rt = createRuntime();
    const payload = signal<{ ids: number[]; labels: string[] }>({
      ids: [0, 1],
      labels: ["zero", "one"],
    });
    let previousIds: number[] = [];
    const store = createStoreProjection<Record<number, string | undefined>>(
      (draft) => {
        const current = payload();
        for (let i = 0; i < previousIds.length; i++) {
          delete draft[previousIds[i]];
        }
        for (let i = 0; i < current.ids.length; i++) {
          draft[current.ids[i]] = current.labels[i];
        }
        previousIds = current.ids.slice();
      },
      {},
    );
    const seen = { 0: 0, 1: 0, 2: 0 };

    effect(() => {
      void store[0];
      seen[0] += 1;
    });
    effect(() => {
      void store[1];
      seen[1] += 1;
    });
    effect(() => {
      void store[2];
      seen[2] += 1;
    });

    expect(seen).toEqual({ 0: 1, 1: 1, 2: 1 });

    payload.set({ ids: [1, 2], labels: ["one-next", "two"] });
    rt.flush();

    expect(seen).toEqual({ 0: 2, 1: 2, 2: 2 });

    payload.set({ ids: [1, 2], labels: ["one-final", "two"] });
    rt.flush();

    expect(seen).toEqual({ 0: 2, 1: 3, 2: 2 });
  });
});

describe("Projection basics", () => {
  it("should observe key changes", () => {
    const rt = createRuntime();
    const source = signal(0);
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

    source.set(1);
    rt.flush();

    expect(memo0()).toBe(false);
    expect(memo1()).toBe(true);
    expect(memo2()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(2);
    expect(effect2).toHaveBeenCalledTimes(1);

    source.set(2);
    rt.flush();

    expect(memo0()).toBe(false);
    expect(memo1()).toBe(false);
    expect(memo2()).toBe(true);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(2);

    source.set(-1);
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
    const bar = signal("foo");
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

    bar.set("baz");
    rt.flush();

    expect(fooView()).toBe(undefined);
    expect(bazView()).toBe("baz");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("should work for chained projections", () => {
    const rt = createRuntime();
    const x = signal(1);
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
    x.set(2);
    rt.flush();

    expect(tmp).toBeCalledTimes(1);
    expect(tmp).toBeCalledWith(2, 1);
  });

  it("should fork a signal values", () => {
    const rt = createRuntime();
    const x = signal<{ v: number; y?: number }>({ v: 1 });
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

    x.set({ v: 2 });
    rt.flush();

    expect(tmp).toBeCalledTimes(2);
    expect(tmp).toHaveBeenNthCalledWith(1, 2, 1);
    expect(tmp).toHaveBeenNthCalledWith(2, undefined, undefined);
    tmp.mockReset();

    x.set({ v: 2, y: 3 });
    rt.flush();

    expect(tmp).toBeCalledTimes(2);
    expect(tmp).toHaveBeenNthCalledWith(1, 2, 2);
    expect(tmp).toHaveBeenNthCalledWith(2, 3, undefined);
  });

});

describe("selection with projections", () => {
  it("simple selection", () => {
    const rt = createRuntime();
    const selected = signal<number | undefined>(undefined);
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

    selected.set(3);
    rt.flush();
    views[3]!();
    expect(list[3]).toBe("selected");
    expect(counts[3]).toBe(2);

    selected.set(6);
    rt.flush();
    views[3]!();
    views[6]!();
    expect(list[3]).toBe("no");
    expect(list[6]).toBe("selected");

    selected.set(undefined);
    rt.flush();
    views[6]!();
    expect(list[6]).toBe("no");

    selected.set(5);
    rt.flush();
    views[5]!();
    expect(list[5]).toBe("selected");
  });

  it("double selection", () => {
    const rt = createRuntime();
    const selected = signal<number | undefined>(undefined);
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

    selected.set(3);
    rt.flush();
    firstViews[3]!();
    secondViews[3]!();
    expect(count).toBe(2);
    expect(list[3][0]).toBe("selected");
    expect(list[3][1]).toBe("oui");

    count = 0;
    selected.set(6);
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
