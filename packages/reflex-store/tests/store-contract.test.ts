import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeNode,
  disposeWatcher,
  readConsumerLazy,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  computed,
  createRuntime,
  effect,
  signal,
} from "../../reflex/tests/reflex.test_utils";
import {
  collectStore,
  createKeyedProjection,
  createReactiveMap,
  createSelector,
  createStoreProjection,
  deep,
  disposeStore,
  opaque,
  raw,
  ref,
  shallow,
  snapshot,
  transaction,
} from "../src/advanced";

function lowSignal<T>(value: T) {
  const node = createProducer(value);
  return {
    node,
    read: () => readProducer(node),
    set: (next: T) => writeProducer(node, next),
  };
}

describe("demand-driven store contract", () => {
  it("defers initialization/recomputation, memoizes clean reads, and pulls without flushing", () => {
    const rt = createRuntime();
    const source = signal(1);
    let runs = 0;
    const store = createStoreProjection(
      () => {
        runs++;
        return { doubled: source() * 2 };
      },
      { doubled: 0 },
    );
    expect(runs).toBe(0);
    expect(store.doubled).toBe(2);
    expect(store.doubled).toBe(2);
    expect(runs).toBe(1);
    source.set(2);
    rt.flush();
    expect(runs).toBe(1);
    expect(store.doubled).toBe(4);
    expect(runs).toBe(2);
    disposeStore(store);
  });

  it("tracks the leaf without rerunning for a replaced sibling or ancestor identity", () => {
    const rt = createRuntime();
    const source = signal({ user: { name: "Ada", age: 28 } });
    const store = createStoreProjection(() => source(), source());
    const user = store.user;
    let runs = 0;
    const stop = effect(() => {
      void store.user.name;
      runs++;
    });
    source.set({ user: { name: "Ada", age: 29 } });
    rt.flush();
    expect(runs).toBe(1);
    expect(store.user).toBe(user);
    source.set({ user: { name: "Grace", age: 29 } });
    rt.flush();
    expect(runs).toBe(2);
    expect(user.name).toBe("Grace");
    stop();
    disposeStore(store);
  });

  it("separates value, existence, own keys and enumerable keys including undefined values", () => {
    const rt = createRuntime();
    const source = signal<Record<string, number | undefined>>({ a: 1 });
    const store = createStoreProjection(() => source(), {});
    const runs = [0, 0, 0, 0];
    const stops = [
      effect(() => {
        void store.a;
        runs[0]++;
      }),
      effect(() => {
        void ("a" in store);
        runs[1]++;
      }),
      effect(() => {
        Object.keys(store);
        runs[2]++;
      }),
      effect(() => {
        void ("missing" in store);
        runs[3]++;
      }),
    ];
    source.set({ a: 2 });
    rt.flush();
    expect(runs).toEqual([2, 1, 1, 1]);
    source.set({ a: 2, missing: undefined });
    rt.flush();
    expect(runs).toEqual([2, 1, 2, 2]);
    source.set({ missing: undefined });
    rt.flush();
    expect(runs).toEqual([3, 2, 3, 2]);
    stops.forEach((stop) => stop());
    disposeStore(store);
  });

  it("preserves array behavior with separate index, length and iteration reads", () => {
    const rt = createRuntime();
    const source = signal([1, 2]);
    const store = createStoreProjection(() => ({ items: source() }), {
      items: [] as number[],
    });
    const runs = [0, 0, 0];
    const stops = [
      effect(() => {
        void store.items[0];
        runs[0]++;
      }),
      effect(() => {
        void store.items.length;
        runs[1]++;
      }),
      effect(() => {
        void [...store.items];
        runs[2]++;
      }),
    ];
    expect(Array.isArray(store.items)).toBe(true);
    expect(store.items.map((n) => n * 2)).toEqual([2, 4]);
    expect(Object.keys(store.items)).toEqual(["0", "1"]);
    source.set([1, 3]);
    rt.flush();
    expect(runs).toEqual([1, 1, 2]);
    source.set([1, 3, 4]);
    rt.flush();
    expect(runs).toEqual([1, 2, 3]);
    expect(() => store.items.push(5)).toThrow();
    expect(() => Object.defineProperty(store, "x", { value: 1 })).toThrow();
    expect(() => Object.preventExtensions(store)).toThrow();
    stops.forEach((stop) => stop());
    disposeStore(store);
  });

  it("handles parent disappearance and reappearance through a retained path view", () => {
    const rt = createRuntime();
    const source = signal<{ user?: { name: string } }>({
      user: { name: "Ada" },
    });
    const store = createStoreProjection(() => source(), {});
    const user = store.user!;
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(user.name);
    });
    source.set({});
    rt.flush();
    source.set({ user: { name: "Grace" } });
    rt.flush();
    expect(seen).toEqual(["Ada", undefined, "Grace"]);
    stop();
    disposeStore(store);
  });

  it("detaches dynamic branches and reclaims locations at an owner boundary", () => {
    const rt = createRuntime();
    const left = lowSignal(1),
      right = lowSignal(2);
    const branch = signal(true);
    const store = createStoreProjection(
      () => ({ value: branch() ? left.read() : right.read() }),
      { value: 0 },
    );
    const stop = effect(() => {
      void store.value;
    });
    expect(left.node.firstOut).not.toBeNull();
    branch.set(false);
    rt.flush();
    expect(left.node.firstOut).toBeNull();
    stop();
    collectStore(store);
    expect(right.node.firstOut).toBeNull();
    right.set(3);
    expect(store.value).toBe(3);
    collectStore(store);
    expect(right.node.firstOut).toBeNull();
    disposeStore(store);
    expect(() => store.value).toThrow(/disposed/);
  });

  it("does not tear down still-observed paths when collecting", () => {
    const rt = createRuntime();
    const source = lowSignal(1);
    const store = createStoreProjection(() => ({ value: source.read() }), {
      value: 0,
    });
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(store.value);
    });
    collectStore(store);
    source.set(2);
    rt.flush();
    expect(seen).toEqual([1, 2]);
    stop();
    disposeStore(store);
    expect(source.node.firstOut).toBeNull();
  });

  it("supports explicit depth and preserves foreign objects", () => {
    createRuntime();
    const catalog = ref({ count: 1 });
    const api = opaque({ call: () => 42 });
    const date = new Date(0);
    const bytes = new Uint8Array([1, 2]);
    const options = shallow({ nested: { value: 1 } });
    const store = createStoreProjection(
      () => ({ catalog, api, date, bytes, options, deep: deep({ value: 1 }) }),
      {},
    );
    expect(store.catalog).toBe(catalog);
    expect(store.api).toBe(api);
    expect(store.date.getTime()).toBe(0);
    expect(store.bytes).toBe(bytes);
    expect(store.options.nested).toBe(options.nested);
    expect(store.deep).not.toBe(raw(store).deep);
    disposeStore(store);
  });

  it("creates untracked, frozen snapshots and handles cycles, symbols and sparse arrays", () => {
    const rt = createRuntime();
    const source = signal(1);
    const key = Symbol("key");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const store = createStoreProjection(
      () => ({ value: source(), [key]: 2, cycle, sparse: new Array(3) }),
      {},
    );
    let runs = 0;
    const stop = effect(() => {
      snapshot(store);
      raw(store);
      runs++;
    });
    const saved = snapshot(store);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(saved.cycle.self).toBe(saved.cycle);
    expect(saved[key]).toBe(2);
    expect(saved.sparse.length).toBe(3);
    expect(Object.keys(saved.sparse)).toEqual([]);
    source.set(2);
    rt.flush();
    expect(runs).toBe(1);
    expect(saved.value).toBe(1);
    expect(store.value).toBe(2);
    expect(
      JSON.stringify(snapshot(createStoreProjection(() => ({ value: 1 }), {}))),
    ).toBe('{"value":1}');
    stop();
    disposeStore(store);
  });

  it("applies explicit equality at the projection boundary", () => {
    const rt = createRuntime();
    const source = signal({ version: 1, label: "one" });
    const store = createStoreProjection(() => source(), source(), {
      equals: (a, b) => a.version === b.version,
    });
    let runs = 0;
    const stop = effect(() => {
      void store.label;
      runs++;
    });
    source.set({ version: 1, label: "equivalent" });
    rt.flush();
    expect(store.label).toBe("one");
    expect(runs).toBe(1);
    source.set({ version: 2, label: "two" });
    rt.flush();
    expect(store.label).toBe("two");
    expect(runs).toBe(2);
    stop();
    disposeStore(store);
  });

  it("keeps keyed derivations lazy and reclaims subscriptions after consumers leave", () => {
    const rt = createRuntime();
    const source = lowSignal({ id: "a", label: "one" });
    let runs = 0;
    const labels = createKeyedProjection(
      source.read,
      (x) => x.id,
      (x) => {
        runs++;
        return x.label;
      },
    );
    expect(source.node.firstOut).toBeNull();
    expect(labels("absent")).toBeUndefined();
    expect(runs).toBe(0);
    expect(labels("a")).toBe("one");
    expect(runs).toBe(1);
    source.set({ id: "a", label: "two" });
    rt.flush();
    expect(runs).toBe(1);
    expect(labels("a")).toBe("two");
    const stop = effect(() => {
      labels("a");
    });
    stop();
    labels.collect();
    expect(source.node.firstOut).toBeNull();
    source.set({ id: "a", label: "three" });
    expect(labels("a")).toBe("three");
    labels.dispose();
    labels.dispose();
    expect(() => labels("a")).toThrow(/disposed/);
  });

  it("uses Object.is for selector keys, including signed zero and NaN", () => {
    const rt = createRuntime();
    const source = signal(0);
    const selected = createSelector(source);
    const seen: boolean[][] = [];
    const stop = effect(() => {
      seen.push([selected(0), selected(-0), selected(NaN)]);
    });
    source.set(-0);
    rt.flush();
    source.set(NaN);
    rt.flush();
    expect(seen).toEqual([
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ]);
    stop();
    selected.dispose();
  });
});

describe("dynamic collection contract", () => {
  it("initializes lazily and keeps untracked reads cold", () => {
    createRuntime();
    let calls = 0;
    const map = createReactiveMap(() => {
      calls++;
      return [["a", 1]] as const;
    });
    expect(calls).toBe(0);
    expect(map.get("a")).toBe(1);
    for (let i = 0; i < 10_000; i++) map.get(String(i));
    expect(calls).toBe(1);
    // Cold reads never enter the runtime graph; a watcher gets just the one requested location.
    const watcher = createWatcher(() => {
      map.get("a");
    });
    runWatcher(watcher);
    expect(watcher.firstIn?.nextIn).toBeNull();
    disposeWatcher(watcher);
    map.collect();
    map.dispose();
  });

  it("separates get/has/keys/values/size and respects no-op writes", () => {
    const rt = createRuntime();
    const map = createReactiveMap<string, number | undefined>([["a", 1]]);
    const runs = [0, 0, 0, 0, 0, 0];
    const stops = [
      effect(() => {
        map.get("a");
        runs[0]++;
      }),
      effect(() => {
        map.has("a");
        runs[1]++;
      }),
      effect(() => {
        void [...map.keys()];
        runs[2]++;
      }),
      effect(() => {
        void [...map.values()];
        runs[3]++;
      }),
      effect(() => {
        void map.size;
        runs[4]++;
      }),
      effect(() => {
        map.get("b");
        runs[5]++;
      }),
    ];
    map.set("a", 2);
    rt.flush();
    expect(runs).toEqual([2, 1, 1, 2, 1, 1]);
    map.set("a", 2);
    rt.flush();
    expect(runs).toEqual([2, 1, 1, 2, 1, 1]);
    map.set("b", undefined);
    rt.flush();
    expect(runs).toEqual([2, 1, 2, 3, 2, 1]);
    map.delete("a");
    rt.flush();
    expect(runs).toEqual([3, 2, 3, 4, 3, 1]);
    map.clear();
    rt.flush();
    expect(runs).toEqual([3, 2, 4, 5, 4, 1]);
    stops.forEach((stop) => stop());
    map.dispose();
  });

  it("publishes consistent transitions under eager scheduling, including nested actions and throws", () => {
    createRuntime({ effectStrategy: "eager" });
    const map = createReactiveMap([
      ["x", 1],
      ["y", 1],
    ]);
    const a = computed(() => map.get("x")! * 2);
    const b = computed(() => map.get("x")! + 1);
    const seen: number[][] = [];
    const stop = effect(() => {
      seen.push([a() + b(), map.get("y")!, map.size]);
    });
    transaction(() => {
      map.set("x", 2);
      transaction(() => {
        map.set("y", 2);
      });
    });
    expect(seen).toEqual([
      [4, 1, 2],
      [7, 2, 2],
    ]);
    expect(() =>
      transaction(() => {
        map.set("y", 3);
        throw Error("boom");
      }),
    ).toThrow("boom");
    expect(seen.at(-1)).toEqual([7, 3, 2]);
    stop();
    map.dispose();
  });

  it("reclaims exact key nodes and supports fresh observation after collection", () => {
    const rt = createRuntime();
    const map = createReactiveMap([["a", 1]]);
    const first = createConsumer(() => map.get("a"));
    readConsumerLazy.call(first);
    const oldNode = first.firstIn!.from;
    disposeNode(first);
    map.collect();
    expect(oldNode.payload).toBeUndefined();
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(map.get("a"));
    });
    map.set("a", 2);
    rt.flush();
    expect(seen).toEqual([1, 2]);
    stop();
    disposeStore(map);
    expect(() => map.size).toThrow(/disposed/);
  });

  it("supports equality, native key identity, iteration, forEach and snapshots", () => {
    const rt = createRuntime();
    const key = {};
    const first = { version: 1, name: "one" };
    const map = createReactiveMap([[key, first]], {
      equals: (a, b) => a.version === b.version,
    });
    let runs = 0;
    const stop = effect(() => {
      map.get(key);
      runs++;
    });
    map.set(key, { version: 1, name: "equivalent" });
    rt.flush();
    expect(runs).toBe(1);
    expect(map.get(key)).toBe(first);
    expect([...map]).toEqual([[key, first]]);
    map.forEach((value, itemKey, collection) => {
      expect(value).toBe(first);
      expect(itemKey).toBe(key);
      expect(collection).toBe(map);
    });
    const saved = snapshot(map);
    map.set(key, { version: 2, name: "two" });
    expect(saved.get(key)?.name).toBe("one");
    expect(() => (saved as Map<object, unknown>).clear()).toThrow();
    expect(raw(map)).toBeInstanceOf(Map);
    stop();
    map.dispose();
  });
});
