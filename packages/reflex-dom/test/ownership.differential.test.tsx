/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import {
  addCleanup,
  createContext,
  createOwnedEffect,
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  getActiveOwnerContext,
  provideContext,
  runWithOwnershipNode,
  useContext,
  usingOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import {
  createProducer,
  readProducer,
  writeProducer,
} from "@volynets/reflex-runtime";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import { createDOMRenderer, For, useEffect, useMountedEffect, useOwned } from "../src";
import { createRendererRuntime } from "../src/runtime/options";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

describe.each(["eager", "sab", "flush"] as const)(
  "%s framework / DOM ownership differential",
  (strategy: EffectStrategy) => {
    it("matches scope disposal and context inheritance across branch replacements", async () => {
      const Theme = createContext("default");
      const referenceOwner = createOwnerContext();
      const referenceRoot = createOwnershipNode();
      const referenceLog: string[] = [];
      const domLog: string[] = [];
      let referenceBranch: OwnershipNode | null = null;
      let currentKey = 0;

      runWithOwnershipNode(referenceOwner, referenceRoot, () => {
        provideContext(referenceOwner, Theme, "root");
        referenceLog.push("mount:root");
        addCleanup(referenceRoot, () => referenceLog.push("cleanup:root"));
      });

      const mountReferenceBranch = (key: number): OwnershipNode => {
        const branch = createOwnershipNode();
        runWithOwnershipNode(referenceOwner, referenceRoot, () =>
          runWithOwnershipNode(referenceOwner, branch, () => {
            provideContext(referenceOwner, Theme, `branch-${key}`);
            referenceLog.push(`mount:${key}:branch:${useContext(referenceOwner, Theme)}`);
            addCleanup(branch, () => referenceLog.push(`cleanup:${key}:branch`));
            for (const label of ["left", "right"]) {
              const leaf = createOwnershipNode();
              runWithOwnershipNode(referenceOwner, leaf, () => {
                referenceLog.push(`mount:${key}:${label}:${useContext(referenceOwner, Theme)}`);
                addCleanup(leaf, () => referenceLog.push(`cleanup:${key}:${label}`));
              });
            }
          }),
        );
        return branch;
      };

      const renderer = createDOMRenderer({ effectStrategy: strategy });
      const runtime = renderer.execution.runtime!;
      const source = runtime.run(() => createProducer(0));
      const container = document.createElement("div");

      function Leaf({ label, branchKey }: { label: string; branchKey: number }) {
        const owner = getActiveOwnerContext()!;
        useOwned(
          () => {
            domLog.push(`mount:${branchKey}:${label}:${useContext(owner, Theme)}`);
            return label;
          },
          () => domLog.push(`cleanup:${branchKey}:${label}`),
        );
        return <span>{label}</span>;
      }

      function Branch({ branchKey }: { branchKey: number }) {
        const owner = getActiveOwnerContext()!;
        provideContext(owner, Theme, `branch-${branchKey}`);
        useOwned(
          () => domLog.push(`mount:${branchKey}:branch:${useContext(owner, Theme)}`),
          () => domLog.push(`cleanup:${branchKey}:branch`),
        );
        return <div><Leaf label="left" branchKey={branchKey} /><Leaf label="right" branchKey={branchKey} /></div>;
      }

      function Root() {
        const owner = getActiveOwnerContext()!;
        provideContext(owner, Theme, "root");
        useOwned(
          () => domLog.push("mount:root"),
          () => domLog.push("cleanup:root"),
        );
        return <section>{() => {
          const branchKey = readProducer(source);
          return branchKey === 0 ? null : <Branch branchKey={branchKey} />;
        }}</section>;
      }

      const dispose = renderer.render(<Root />, container);
      expect(domLog).toEqual(referenceLog);
      const next = random(0x82b31a53);
      let lastKey = 0;

      for (let step = 0; step < 120; step++) {
        const choice = next() % 4;
        const newKey = choice === 0 ? 0 : choice === 1 ? currentKey : ++lastKey;
        if (newKey !== currentKey) {
          if (referenceBranch !== null) disposeOwnershipNode(referenceBranch);
          referenceBranch = newKey === 0 ? null : mountReferenceBranch(newKey);
          currentKey = newKey;
        }
        runtime.batch(() => writeProducer(source, newKey));
        if (strategy === "flush") await Promise.resolve();

        const context = `strategy=${strategy} step=${step} key=${newKey}`;
        expect(domLog, context).toEqual(referenceLog);
        expect(container.querySelectorAll("span").length, context).toBe(newKey === 0 ? 0 : 2);
        expect(container.textContent, context).toBe(newKey === 0 ? "" : "leftright");
      }

      if (referenceBranch !== null) disposeOwnershipNode(referenceBranch);
      disposeOwnershipNode(referenceRoot);
      dispose();
      expect(domLog).toEqual(referenceLog);
      expect(container.textContent).toBe("");
      dispose();
      expect(domLog).toEqual(referenceLog);
    });

    it("matches nested owned-effect reruns and cleanup after batched writes", async () => {
      const referenceRuntime = createRendererRuntime({ effectStrategy: strategy });
      const renderer = createDOMRenderer({ effectStrategy: strategy });
      const domRuntime = renderer.execution.runtime!;
      const referenceOwner = createOwnerContext();
      const referenceRoot = createOwnershipNode();
      const referenceLog: string[] = [];
      const domLog: string[] = [];
      const referenceOuter = referenceRuntime.run(() => createProducer(0));
      const referenceInner = referenceRuntime.run(() => createProducer(0));
      const referenceEnabled = referenceRuntime.run(() => createProducer(true));
      const domOuter = domRuntime.run(() => createProducer(0));
      const domInner = domRuntime.run(() => createProducer(0));
      const domEnabled = domRuntime.run(() => createProducer(true));

      referenceRuntime.run(() =>
        runWithOwnershipNode(referenceOwner, referenceRoot, () => {
          createOwnedEffect(referenceOwner, referenceRoot, () => {
            const outer = readProducer(referenceOuter);
            const enabled = readProducer(referenceEnabled);
            referenceLog.push(`outer:${outer}:${enabled}`);
            if (enabled) {
              createOwnedEffect(referenceOwner, referenceOwner.currentNode, () => {
                const inner = readProducer(referenceInner);
                referenceLog.push(`inner:${inner}`);
                return () => referenceLog.push(`inner:cleanup:${inner}`);
              });
            }
            return () => referenceLog.push(`outer:cleanup:${outer}`);
          });
        }),
      );

      const container = document.createElement("div");
      function View() {
        useEffect(() => {
          const outer = readProducer(domOuter);
          const enabled = readProducer(domEnabled);
          domLog.push(`outer:${outer}:${enabled}`);
          if (enabled) {
            useEffect(() => {
              const inner = readProducer(domInner);
              domLog.push(`inner:${inner}`);
              return () => domLog.push(`inner:cleanup:${inner}`);
            });
          }
          return () => domLog.push(`outer:cleanup:${outer}`);
        });
        return <span>{() => readProducer(domOuter)}</span>;
      }
      const dispose = renderer.render(<View />, container);
      expect(domLog).toEqual(referenceLog);

      const next = random(0xc128f0a5);
      let outer = 0;
      let inner = 0;
      let enabled = true;
      for (let step = 0; step < 120; step++) {
        const choice = next() % 3;
        referenceRuntime.batch(() => {
          if (choice === 0) writeProducer(referenceOuter, ++outer);
          else if (choice === 1) writeProducer(referenceInner, ++inner);
          else writeProducer(referenceEnabled, enabled = !enabled);
        });
        domRuntime.batch(() => {
          if (choice === 0) writeProducer(domOuter, outer);
          else if (choice === 1) writeProducer(domInner, inner);
          else writeProducer(domEnabled, enabled);
        });
        if (strategy === "flush") await Promise.resolve();
        const context = `strategy=${strategy} step=${step} choice=${choice}`;
        expect(domLog, context).toEqual(referenceLog);
        expect(container.textContent, context).toBe(String(outer));
      }

      disposeOwnershipNode(referenceRoot);
      dispose();
      expect(domLog).toEqual(referenceLog);
    });
  },
);

describe("framework / DOM ownership failure boundary", () => {
  it("cleans a component that throws during mount and permits a clean retry", () => {
    const error = new Error("mount failed");
    const referenceLog: string[] = [];
    const domLog: string[] = [];
    const owner = createOwnerContext();
    const root = createOwnershipNode();
    expect(() => {
      try {
        runWithOwnershipNode(owner, root, () => {
          const earlier = createOwnershipNode();
          runWithOwnershipNode(owner, earlier, () => {
            referenceLog.push("acquire:earlier");
            addCleanup(earlier, () => referenceLog.push("release:earlier"));
          });
          usingOwnershipNode(owner, (node) => {
            referenceLog.push("acquire:failing");
            addCleanup(node, () => referenceLog.push("release:failing"));
            throw error;
          });
        });
      } catch (cause) {
        disposeOwnershipNode(root);
        throw cause;
      }
    }).toThrow(error);

    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    function Earlier() {
      useOwned(
        () => domLog.push("acquire:earlier"),
        () => domLog.push("release:earlier"),
      );
      return <span>earlier</span>;
    }
    function Failing() {
      useOwned(
        () => domLog.push("acquire:failing"),
        () => domLog.push("release:failing"),
      );
      throw error;
    }
    expect(() => renderer.render(<><Earlier /><Failing /></>, container)).toThrow(error);
    expect(domLog).toEqual(referenceLog);
    expect(container.childNodes).toHaveLength(0);

    const dispose = renderer.render(<span>ready</span>, container);
    expect(container.textContent).toBe("ready");
    dispose();
    expect(container.childNodes).toHaveLength(0);
    disposeOwnershipNode(root);
    expect(domLog).toEqual(referenceLog);
  });

  it("releases a failed dynamic branch and recovers on its next update", () => {
    const error = new Error("branch failed");
    const referenceOwner = createOwnerContext();
    const referenceRoot = createOwnershipNode();
    const referenceLog: string[] = [];
    const domLog: string[] = [];
    const mountReference = (name: string, fail = false): OwnershipNode => {
      const node = createOwnershipNode();
      try {
        runWithOwnershipNode(referenceOwner, referenceRoot, () =>
          runWithOwnershipNode(referenceOwner, node, () => {
            referenceLog.push(`mount:${name}`);
            addCleanup(node, () => referenceLog.push(`cleanup:${name}`));
            if (fail) throw error;
          }),
        );
      } catch (cause) {
        disposeOwnershipNode(node);
        throw cause;
      }
      return node;
    };
    let referenceBranch = mountReference("stable");

    const renderer = createDOMRenderer();
    const runtime = renderer.execution.runtime!;
    const source = runtime.run(() => createProducer(0));
    const container = document.createElement("div");
    function Branch({ name, fail = false }: { name: string; fail?: boolean }) {
      useOwned(
        () => domLog.push(`mount:${name}`),
        () => domLog.push(`cleanup:${name}`),
      );
      if (fail) throw error;
      return <span>{name}</span>;
    }
    const dispose = renderer.render(
      <div>{() => {
        const mode = readProducer(source);
        return mode === 0
          ? <Branch name="stable" />
          : mode === 1
            ? <Branch name="failed" fail />
            : <Branch name="recovered" />;
      }}</div>,
      container,
    );
    expect(domLog).toEqual(referenceLog);

    disposeOwnershipNode(referenceBranch);
    expect(() => mountReference("failed", true)).toThrow(error);
    expect(() => runtime.batch(() => writeProducer(source, 1))).toThrow(error);
    expect(domLog).toEqual(referenceLog);
    expect(container.querySelector("span")).toBeNull();

    referenceBranch = mountReference("recovered");
    runtime.batch(() => writeProducer(source, 2));
    expect(domLog).toEqual(referenceLog);
    expect(container.textContent).toBe("recovered");

    disposeOwnershipNode(referenceBranch);
    disposeOwnershipNode(referenceRoot);
    dispose();
    expect(domLog).toEqual(referenceLog);
  });

  it("rolls back ownership when the initial render effect throws", () => {
    const error = new Error("render effect failed");
    const referenceLog: string[] = [];
    const domLog: string[] = [];
    const referenceRuntime = createRendererRuntime();
    const referenceOwner = createOwnerContext();
    const referenceRoot = createOwnershipNode();
    const referenceComponent = createOwnershipNode();
    runWithOwnershipNode(referenceOwner, referenceRoot, () =>
      runWithOwnershipNode(referenceOwner, referenceComponent, () => {
        referenceLog.push("acquire");
        addCleanup(referenceComponent, () => referenceLog.push("release"));
      }),
    );
    expect(() => {
      try {
        referenceRuntime.run(() =>
          createOwnedEffect(referenceOwner, referenceComponent, () => {
            throw error;
          }),
        );
      } catch (cause) {
        disposeOwnershipNode(referenceRoot);
        throw cause;
      }
    }).toThrow(error);

    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    function Failing() {
      useOwned(
        () => domLog.push("acquire"),
        () => domLog.push("release"),
      );
      useMountedEffect(() => {
        throw error;
      });
      return <span>transient</span>;
    }

    expect(() => renderer.render(<Failing />, container)).toThrow(error);
    expect(domLog).toEqual(referenceLog);
    expect(container.childNodes).toHaveLength(0);

    const dispose = renderer.render(<span>ready</span>, container);
    expect(container.textContent).toBe("ready");
    dispose();
    expect(container.childNodes).toHaveLength(0);
  });
});

describe.each(["eager", "sab", "flush"] as const)(
  "%s keyed-row ownership differential",
  (strategy: EffectStrategy) => {
    it("preserves owners on moves and disposes removed rows once", async () => {
      interface Item { id: number }
      const ListContext = createContext("missing");
      const referenceOwner = createOwnerContext();
      const referenceRoot = createOwnershipNode();
      runWithOwnershipNode(referenceOwner, referenceRoot, () =>
        provideContext(referenceOwner, ListContext, "list"),
      );
      const referenceRows = new Map<number, OwnershipNode>();
      const referenceLog: string[] = [];
      const domLog: string[] = [];
      let fallbackNode: OwnershipNode | null = null;
      const renderer = createDOMRenderer({ effectStrategy: strategy });
      const runtime = renderer.execution.runtime!;
      const source = runtime.run(() => createProducer([] as Item[]));
      const container = document.createElement("div");
      let items: Item[] = [];
      let nextId = 0;
      const next = random(0x93c74b21);
      const mountReferenceRow = (item: Item): void => {
        const rowNode = createOwnershipNode();
        runWithOwnershipNode(referenceOwner, referenceRoot, () =>
          runWithOwnershipNode(referenceOwner, rowNode, () => {
            referenceLog.push(`mount:${item.id}:${useContext(referenceOwner, ListContext)}`);
            addCleanup(rowNode, () => referenceLog.push(`cleanup:${item.id}`));
          }),
        );
        referenceRows.set(item.id, rowNode);
      };
      const mountReferenceFallback = (): void => {
        const node = createOwnershipNode();
        runWithOwnershipNode(referenceOwner, referenceRoot, () =>
          runWithOwnershipNode(referenceOwner, node, () => {
            referenceLog.push(`mount:empty:${useContext(referenceOwner, ListContext)}`);
            addCleanup(node, () => referenceLog.push("cleanup:empty"));
          }),
        );
        fallbackNode = node;
      };

      mountReferenceFallback();

      function Row({ item }: { item: Item }) {
        const owner = getActiveOwnerContext()!;
        useOwned(
          () => domLog.push(`mount:${item.id}:${useContext(owner, ListContext)}`),
          () => domLog.push(`cleanup:${item.id}`),
        );
        return <li data-id={item.id}>{item.id}</li>;
      }
      function Empty() {
        const owner = getActiveOwnerContext()!;
        useOwned(
          () => domLog.push(`mount:empty:${useContext(owner, ListContext)}`),
          () => domLog.push("cleanup:empty"),
        );
        return <li data-empty="true">empty</li>;
      }

      function List() {
        provideContext(getActiveOwnerContext()!, ListContext, "list");
        return <ul><For each={() => readProducer(source)} by={(item) => item.id} fallback={<Empty />}>
          {(item) => <Row item={item} />}
        </For></ul>;
      }

      const dispose = renderer.render(<List />, container);
      expect(domLog).toEqual(referenceLog);

      for (let step = 0; step < 120; step++) {
        const nextItems = items.slice();
        const choice = nextItems.length === 0 ? 0 : next() % 4;
        if (choice === 0) {
          if (items.length === 0) {
            disposeOwnershipNode(fallbackNode!);
            fallbackNode = null;
          }
          const item = { id: ++nextId };
          nextItems.splice(next() % (nextItems.length + 1), 0, item);
          mountReferenceRow(item);
        } else if (choice === 1) {
          const [removed] = nextItems.splice(next() % nextItems.length, 1);
          disposeOwnershipNode(referenceRows.get(removed!.id)!);
          referenceRows.delete(removed!.id);
          if (nextItems.length === 0) mountReferenceFallback();
        } else if (choice === 2) {
          const [moved] = nextItems.splice(next() % nextItems.length, 1);
          nextItems.splice(next() % (nextItems.length + 1), 0, moved!);
        } else {
          const index = next() % nextItems.length;
          const item = { id: nextItems[index]!.id };
          nextItems[index] = item;
          disposeOwnershipNode(referenceRows.get(item.id)!);
          mountReferenceRow(item);
        }
        items = nextItems;
        runtime.batch(() => writeProducer(source, nextItems));
        if (strategy === "flush") await Promise.resolve();
        const context = `strategy=${strategy} step=${step}`;
        expect(domLog, context).toEqual(referenceLog);
        expect(
          Array.from(container.querySelectorAll("li[data-id]"), (node) => Number(node.dataset.id)),
          context,
        ).toEqual(items.map((item) => item.id));
        expect(container.querySelectorAll("li[data-empty]").length, context).toBe(items.length === 0 ? 1 : 0);
      }

      disposeOwnershipNode(referenceRoot);
      dispose();
      expect(domLog).toEqual(referenceLog);
    });
  },
);
