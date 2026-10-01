/** @jsxImportSource ../src */
import { describe, expect, it } from "vitest";
import {
  createDOMRenderer,
  For,
  Portal,
  renderToString,
  useMountedEffect,
  useOwned,
  useSignal,
} from "../src";
import { getDOMContext, withDOMContext } from "../src/runtime/context";

describe("renderer ownership and document boundaries", () => {
  it("waits for deferred feedback before starting the next mounted effect", async () => {
    const renderer = createDOMRenderer({ effectStrategy: "flush" });
    const container = document.createElement("div");
    const log: string[] = [];
    function View() {
      const value = useSignal(0);
      useMountedEffect(() => {
        value(1);
      });
      useMountedEffect(() => {
        log.push(container.textContent!);
      });
      return <p>{value}</p>;
    }
    const dispose = renderer.render(<View />, container);
    expect(log).toEqual([]);
    await Promise.resolve();
    expect(log).toEqual(["1"]);
    dispose();
  });

  it("waits for the outer batch before starting mounted effects", () => {
    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    const log: string[] = [];
    function View() {
      useMountedEffect(() => {
        log.push(container.textContent!);
      });
      return <p>mounted</p>;
    }
    renderer.batch(() => {
      renderer.render(<View />, container);
      expect(log).toEqual([]);
    });
    expect(log).toEqual(["mounted"]);
  });

  it("cancels effects of a root removed before its first delivery", () => {
    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    const log: string[] = [];
    function View() {
      useMountedEffect(() => {
        log.push("should not run");
      });
      return <p>gone</p>;
    }
    renderer.batch(() => renderer.render(<View />, container)());
    expect(log).toEqual([]);
    expect(container.childNodes).toHaveLength(0);
  });

  it.each(["render", "hydrate"] as const)(
    "rolls back a failed %s mounted effect and can retry",
    (operation) => {
      const renderer = createDOMRenderer();
      const container = document.createElement("div");
      const log: string[] = [];
      const error = new Error("mount effect");
      function View() {
        useOwned(
          () => {},
          () => log.push("cleanup"),
        );
        useMountedEffect(() => {
          throw error;
        });
        return <p>ready</p>;
      }
      if (operation === "hydrate") container.innerHTML = "<p>ready</p>";
      expect(() => renderer[operation](<View />, container)).toThrow(error);
      expect(log).toEqual(["cleanup"]);
      expect(container.childNodes).toHaveLength(0);
      const dispose = renderer.render(<p>retry</p>, container);
      expect(container.textContent).toBe("retry");
      dispose();
    },
  );

  it("restores nested contexts on exceptions", () => {
    const first = createDOMRenderer();
    const second = createDOMRenderer();
    withDOMContext(first.execution, () => {
      expect(() =>
        withDOMContext(second.execution, () => {
          throw new Error("nested");
        }),
      ).toThrow("nested");
      expect(getDOMContext()).toBe(first.execution);
    });
    expect(() => getDOMContext()).toThrow("DOM context is not active");
  });

  it("cleans failed dynamic content once and accepts a later update", () => {
    const renderer = createDOMRenderer();
    const container = document.createElement("div");
    const log: string[] = [];
    let set!: (next: number) => void;
    function Failing() {
      useOwned(
        () => {},
        () => log.push("cleanup"),
      );
      throw new Error("branch failed");
    }
    function View() {
      const value = useSignal(0);
      set = value;
      return (
        <div>
          {() => (value() === 1 ? <Failing /> : <span>{value()}</span>)}
        </div>
      );
    }
    const dispose = renderer.render(<View />, container);
    expect(() => renderer.run(() => set(1))).toThrow("branch failed");
    expect(log).toEqual(["cleanup"]);
    renderer.run(() => set(2));
    expect(container.textContent).toBe("2");
    dispose();
    expect(log).toEqual(["cleanup"]);
  });

  it("mounts and updates in a document with no window", () => {
    const doc = document.implementation.createHTMLDocument("detached");
    const renderer = createDOMRenderer();
    let set!: (value: number[]) => void;
    function View() {
      const rows = useSignal([1, 2]);
      set = rows;
      return (
        <ul>
          <For each={rows} by={(value) => value}>
            {(value) => <li>{value}</li>}
          </For>
        </ul>
      );
    }
    const dispose = renderer.render(<View />, doc.body);
    expect(doc.body.textContent).toBe("12");
    renderer.run(() => set([2, 3]));
    expect(doc.body.textContent).toBe("23");
    expect(doc.querySelector("li")!.ownerDocument).toBe(doc);
    dispose();
    expect(doc.body.childNodes).toHaveLength(0);
  });

  it("adopts iframe nodes and uses iframe form properties during hydration", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try {
      const doc = frame.contentDocument!;
      const renderer = createDOMRenderer();
      const foreignNode = document.createElement("strong");
      foreignNode.textContent = "foreign";
      const dispose = renderer.render(
        <div>
          {foreignNode}
          <select value="b">
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </div>,
        doc.body,
      );
      expect(doc.querySelector("strong")).toBe(foreignNode);
      expect(doc.querySelector("select")!.value).toBe("b");
      dispose();
      // Adoption changed ownerDocument but not the node's JavaScript realm.
      const disposeAgain = renderer.render(<div>{foreignNode}</div>, doc.body);
      expect(doc.querySelector("strong")).toBe(foreignNode);
      disposeAgain();
      const view = (
        <section>
          <input value="ready" />
          {() => "text"}
        </section>
      );
      doc.body.innerHTML = renderToString(view);
      const existing = doc.querySelector("section");
      const hydrated = renderer.hydrate(view, doc.body);
      expect(doc.querySelector("section")).toBe(existing);
      expect(doc.querySelector("input")!.value).toBe("ready");
      hydrated();
    } finally {
      frame.remove();
    }
  });

  it("owns a portal across documents and removes it with its source", () => {
    const doc = document.implementation.createHTMLDocument("portal");
    const renderer = createDOMRenderer();
    const source = document.createElement("div");
    const dispose = renderer.render(
      <Portal to={() => doc.body}>
        <button>remote</button>
      </Portal>,
      source,
    );
    expect(doc.querySelector("button")!.ownerDocument).toBe(doc);
    dispose();
    expect(doc.body.childNodes).toHaveLength(0);
  });
});
