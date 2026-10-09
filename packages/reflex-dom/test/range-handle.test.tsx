/** @jsxImportSource ../src */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDOMRangeHandle,
  createDOMRuntime,
  defineModel,
  For,
  hydrate,
  render,
  renderToString,
  Show,
  useAbortSignal,
  type DOMRangeHandle,
} from "../src";
import { signal } from "./reactivity";

function elementNodes(handle: DOMRangeHandle): Element[] {
  return Array.from(handle.nodes()).filter(
    (node): node is Element => node.nodeType === 1,
  );
}

function mockObserver() {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as ResizeObserver;
}

describe("DOM range handles", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  afterEach(() => vi.restoreAllMocks());

  function standalone(parent: Node = document.createElement("div")) {
    const start = document.createComment("start");
    const end = document.createComment("end");
    const element = document.createElement("section");
    parent.appendChild(start);
    parent.appendChild(element);
    parent.appendChild(end);
    return {
      parent,
      start,
      end,
      element,
      handle: createDOMRangeHandle(start, end),
    };
  }

  it("does not unobserve a target still owned by another overlapping handle", async () => {
    const { parent, start, end, element, handle } = standalone();
    const innerStart = document.createTextNode("");
    const innerEnd = document.createTextNode("");
    parent.insertBefore(innerStart, element);
    parent.insertBefore(innerEnd, end);
    const inner = createDOMRangeHandle(innerStart, innerEnd);
    const observer = mockObserver();
    handle.observe(observer);
    const stopInner = inner.observe(observer);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    // Moving the outer boundary drops membership only from the outer range.
    parent.insertBefore(start, end);
    await Promise.resolve();
    expect(observer.unobserve).not.toHaveBeenCalled();
    handle.dispose();
    expect(observer.unobserve).not.toHaveBeenCalled();
    stopInner();
    stopInner();
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(element);
    inner.dispose();
  });

  it("shares parent observation and ignores descendant and unrelated mutations", async () => {
    const { parent, start, element, handle } = standalone();
    document.body.appendChild(parent);
    const bind = vi.spyOn(MutationObserver.prototype, "observe");
    const walk = vi.spyOn(start, "nextSibling", "get");
    const firstObserver = mockObserver();
    const secondObserver = mockObserver();
    const first = handle.observe(firstObserver);
    const second = handle.observe(secondObserver);
    expect(bind.mock.calls).toEqual([[parent, { childList: true }]]);
    walk.mockClear();
    element.appendChild(document.createElement("b"));
    document.body.appendChild(document.createElement("aside"));
    await Promise.resolve();
    expect(walk).not.toHaveBeenCalled();
    expect(firstObserver.observe).toHaveBeenCalledTimes(1);
    expect(secondObserver.observe).toHaveBeenCalledTimes(1);
    // Actual top-level replacement reaches both subscriptions in one walk.
    element.replaceWith(document.createElement("i"));
    await Promise.resolve();
    expect(walk).toHaveBeenCalledTimes(1);
    first();
    expect(secondObserver.unobserve).toHaveBeenCalledTimes(1);
    second();
    expect(secondObserver.unobserve).toHaveBeenCalledTimes(2);
    handle.dispose();
  });

  it("recovers boundaries reattached in a later checkpoint and narrows observation", async () => {
    const { parent, start, end, element, handle } = standalone();
    document.body.appendChild(parent);
    const observer = mockObserver();
    const bind = vi.spyOn(MutationObserver.prototype, "observe");
    handle.observe(observer);
    end.remove();
    await Promise.resolve();
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(element);
    expect(
      bind.mock.calls.some(
        ([target, options]) =>
          target === document && options?.childList && options.subtree,
      ),
    ).toBe(true);
    const destination = document.createElement("div");
    document.body.appendChild(destination);
    destination.append(start, element, end);
    await Promise.resolve();
    expect(observer.observe).toHaveBeenCalledTimes(2);
    expect(bind).toHaveBeenLastCalledWith(destination, { childList: true });
    const next = document.createElement("b");
    element.replaceWith(next);
    await Promise.resolve();
    expect(observer.observe).toHaveBeenLastCalledWith(next);
    handle.dispose();
  });

  it("starts observing unattached anchors and releases queued work on last cleanup", async () => {
    const start = document.createComment("start");
    const end = document.createComment("end");
    const element = document.createElement("b");
    const handle = createDOMRangeHandle(start, end);
    const observer = mockObserver();
    const stop = handle.observe(observer);
    expect(observer.observe).not.toHaveBeenCalled();
    document.body.append(start, element, end);
    await Promise.resolve();
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(element);
    element.replaceWith(document.createElement("i"));
    stop();
    await Promise.resolve();
    expect(observer.observe).toHaveBeenCalledTimes(1);
    const restart = handle.observe(observer);
    expect(observer.observe).toHaveBeenCalledTimes(2);
    restart();
    handle.dispose();
  });

  it("keeps snapshots independent and all operations inert with invalid boundaries", () => {
    const { parent, start, end, element, handle } = standalone();
    document.body.appendChild(parent);
    const button = document.createElement("button");
    element.appendChild(button);
    const snapshot = Array.from(handle.nodes());
    const appended = document.createElement("i");
    parent.insertBefore(appended, end);
    expect(snapshot).toEqual([element]);
    expect(Array.from(handle.nodes())).toEqual([element, appended]);
    const focus = vi.spyOn(button, "focus");
    const blur = vi.spyOn(button, "blur");
    const rects = vi.spyOn(element, "getClientRects");
    const scroll = vi.fn();
    Object.defineProperty(element, "scrollIntoView", { value: scroll });
    button.focus();
    focus.mockClear();
    parent.insertBefore(end, start);
    handle.focus();
    handle.blur();
    handle.scrollIntoView();
    expect(handle.rects()).toEqual([]);
    expect(focus).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(rects).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(Array.from(createDOMRangeHandle(start, start).nodes())).toEqual([]);
    handle.dispose();
  });

  it("reuses one native Range for all nonempty top-level text nodes per measurement", () => {
    const { parent, end, element, handle } = standalone();
    element.remove();
    const texts = ["one", "", "two"].map((value) =>
      document.createTextNode(value),
    );
    for (const text of texts) parent.insertBefore(text, end);
    const rect = new DOMRect(1, 2, 3, 4);
    const native = document.createRange.bind(document);
    const create = vi.spyOn(document, "createRange").mockImplementation(() => {
      const range = native();
      Object.defineProperty(range, "getClientRects", { value: () => [rect] });
      return range;
    });
    expect(handle.rects()).toEqual([rect, rect]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(handle.rects()).toEqual([rect, rect]);
    expect(create).toHaveBeenCalledTimes(2);
    handle.dispose();
  });

  it("stops focusing immediately if a focus callback disposes the handle", () => {
    const { parent, element, handle } = standalone();
    document.body.appendChild(parent);
    const first = document.createElement("button");
    const second = document.createElement("button");
    element.append(first, second);
    vi.spyOn(first, "focus").mockImplementation(() => handle.dispose());
    const focusNext = vi.spyOn(second, "focus");
    handle.focus();
    expect(handle.disposed).toBe(true);
    expect(focusNext).not.toHaveBeenCalled();
  });

  it("rolls back a failed observer subscription without stopping existing subscriptions", () => {
    const { parent, end, element, handle } = standalone();
    const second = document.createElement("b");
    parent.insertBefore(second, end);
    const existing = mockObserver();
    handle.observe(existing);
    const failing = mockObserver();
    vi.mocked(failing.observe).mockImplementation((target) => {
      if (target === second) throw new Error("observe failed");
    });
    expect(() => handle.observe(failing)).toThrow("observe failed");
    expect(failing.unobserve).toHaveBeenCalledExactlyOnceWith(element);
    expect(existing.unobserve).not.toHaveBeenCalled();
    handle.dispose();
    expect(existing.unobserve).toHaveBeenCalledTimes(2);
  });

  it("releases a subscription disposed synchronously by observer.observe", () => {
    const { element, handle } = standalone();
    const observer = mockObserver();
    vi.mocked(observer.observe).mockImplementation(() => handle.dispose());
    const stop = handle.observe(observer);
    expect(handle.disposed).toBe(true);
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(element);
    stop();
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
  });

  it("does not leak a new subscription if synchronizing an existing one disposes the handle", () => {
    const { element, handle } = standalone();
    const existing = mockObserver();
    handle.observe(existing);
    vi.mocked(existing.unobserve).mockImplementation(() => handle.dispose());
    element.replaceWith(document.createElement("b"));
    const next = mockObserver();
    const stop = handle.observe(next);
    expect(handle.disposed).toBe(true);
    expect(next.observe).not.toHaveBeenCalled();
    stop();
    expect(existing.unobserve).toHaveBeenCalledTimes(1);
  });

  it("preserves Show handle identity across replacement, emptiness and disposal", () => {
    const container = document.createElement("div");
    const [visible, setVisible] = signal(true);
    const ref = { current: null as DOMRangeHandle | null };
    const dispose = render(
      <Show when={visible} ref={ref}>
        <b>one</b>
        <i>two</i>
      </Show>,
      container,
    );
    const handle = ref.current!;
    expect(elementNodes(handle).map((node) => node.localName)).toEqual([
      "b",
      "i",
    ]);
    setVisible(false);
    expect(ref.current).toBe(handle);
    expect(Array.from(handle.nodes())).toEqual([]);
    setVisible(true);
    expect(ref.current).toBe(handle);
    expect(elementNodes(handle)).toHaveLength(2);
    dispose();
    expect(ref.current).toBeNull();
    expect(handle.disposed).toBe(true);
    expect(Array.from(handle.nodes())).toEqual([]);
  });

  it("reads keyed rows in their current order without replacing the ref", () => {
    const container = document.createElement("div");
    const [items, setItems] = signal([1, 2]);
    const callback = vi.fn((_handle: DOMRangeHandle | null) => {});
    const dispose = render(
      <For
        each={items}
        by={(item) => item}
        ref={callback}
        fallback={<em>empty</em>}
      >
        {(item) => <button>{item}</button>}
      </For>,
      container,
    );
    const handle = callback.mock.calls[0]![0]!;
    const original = elementNodes(handle);
    setItems([2, 1, 3]);
    expect(elementNodes(handle).map((node) => node.textContent)).toEqual([
      "2",
      "1",
      "3",
    ]);
    expect(elementNodes(handle)[0]).toBe(original[1]);
    expect(callback).toHaveBeenCalledTimes(1);
    setItems([]);
    expect(elementNodes(handle)[0]?.localName).toBe("em");
    dispose();
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(handle.disposed).toBe(true);
  });

  it("focuses descendants, blurs only members and scrolls the first element", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ref = { current: null as DOMRangeHandle | null };
    const dispose = render(
      <Show when={true} ref={ref}>
        <section>
          <button disabled>skip</button>
          <input />
        </section>
        <button>next</button>
      </Show>,
      container,
    );
    const handle = ref.current!;
    const input = container.querySelector("input")!;
    handle.focus({ preventScroll: true });
    expect(document.activeElement).toBe(input);
    handle.blur();
    expect(document.activeElement).not.toBe(input);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    handle.blur();
    expect(document.activeElement).toBe(outside);
    const first = elementNodes(handle)[0]!;
    const scroll = vi.fn();
    Object.defineProperty(first, "scrollIntoView", { value: scroll });
    handle.scrollIntoView({ block: "center" });
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    dispose();
  });

  it("updates observer membership after branch changes and releases only its targets", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [visible, setVisible] = signal(true);
    const ref = { current: null as DOMRangeHandle | null };
    const dispose = render(
      <Show when={visible} ref={ref} fallback={<i>fallback</i>}>
        <b>shown</b>
      </Show>,
      container,
    );
    const handle = ref.current!;
    const observer = mockObserver();
    const before = elementNodes(handle)[0]!;
    const stop = handle.observe(observer);
    expect(observer.observe).toHaveBeenCalledWith(before);
    setVisible(false);
    await Promise.resolve();
    const after = elementNodes(handle)[0]!;
    expect(observer.unobserve).toHaveBeenCalledWith(before);
    expect(observer.observe).toHaveBeenCalledWith(after);
    dispose();
    expect(observer.unobserve).toHaveBeenCalledWith(after);
    expect(observer.disconnect).not.toHaveBeenCalled();
    const calls = vi.mocked(observer.unobserve).mock.calls.length;
    stop();
    handle.dispose();
    expect(observer.unobserve).toHaveBeenCalledTimes(calls);
  });

  it("hydrates Show and For refs and keeps them live on later updates", () => {
    const [visible, setVisible] = signal(true);
    const [items, setItems] = signal([1]);
    const showRef = { current: null as DOMRangeHandle | null };
    const forRef = { current: null as DOMRangeHandle | null };
    const view = (
      <>
        <Show when={visible} ref={showRef}>
          <b>shown</b>
        </Show>
        <For each={items} by={(item) => item} ref={forRef}>
          {(item) => <i>{item}</i>}
        </For>
      </>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(view);
    expect(showRef.current).toBeNull();
    expect(forRef.current).toBeNull();
    const dispose = hydrate(view, container);
    const showHandle = showRef.current!;
    const forHandle = forRef.current!;
    expect(elementNodes(showHandle)[0]?.textContent).toBe("shown");
    expect(elementNodes(forHandle)[0]?.textContent).toBe("1");
    setVisible(false);
    setItems([2, 3]);
    expect(Array.from(showHandle.nodes())).toEqual([]);
    expect(elementNodes(forHandle).map((node) => node.textContent)).toEqual([
      "2",
      "3",
    ]);
    expect(forRef.current).toBe(forHandle);
    dispose();
    expect(showRef.current).toBeNull();
    expect(forRef.current).toBeNull();
  });

  it("shares an observer safely across subscriptions to the same handle", () => {
    const container = document.createElement("div");
    const ref = { current: null as DOMRangeHandle | null };
    const dispose = render(
      <Show when={true} ref={ref}>
        <b />
      </Show>,
      container,
    );
    const observer = mockObserver();
    const first = ref.current!.observe(observer);
    const second = ref.current!.observe(observer);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    first();
    expect(observer.unobserve).not.toHaveBeenCalled();
    second();
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("tracks observations when a detached range moves into a shadow root", async () => {
    const fragment = document.createDocumentFragment();
    const start = document.createComment("start");
    const end = document.createComment("end");
    const first = document.createElement("b");
    fragment.append(start, first, end);
    const handle = createDOMRangeHandle(start, end);
    const observer = mockObserver();
    handle.observe(observer);
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);
    shadow.appendChild(fragment);
    await Promise.resolve();
    const next = document.createElement("i");
    first.replaceWith(next);
    await Promise.resolve();
    expect(observer.unobserve).toHaveBeenCalledWith(first);
    expect(observer.observe).toHaveBeenCalledWith(next);
    handle.dispose();
    expect(observer.unobserve).toHaveBeenCalledWith(next);
  });

  it("returns element and text rects and excludes invalid anchor boundaries", () => {
    const container = document.createElement("div");
    const start = document.createComment("start");
    const end = document.createComment("end");
    const text = document.createTextNode("text");
    const element = document.createElement("span");
    container.append(start, text, element, end);
    const textRect = new DOMRect(1, 2, 3, 4);
    const elementRect = new DOMRect(5, 6, 7, 8);
    vi.spyOn(element, "getClientRects").mockReturnValue([
      elementRect,
    ] as unknown as DOMRectList);
    const nativeCreateRange = document.createRange.bind(document);
    vi.spyOn(document, "createRange").mockImplementation(() => {
      const range = nativeCreateRange();
      Object.defineProperty(range, "getClientRects", {
        value: () => [textRect],
      });
      return range;
    });
    const handle = createDOMRangeHandle(start, end);
    expect(Array.from(handle.nodes())).toEqual([text, element]);
    expect(handle.rects()).toEqual([textRect, elementRect]);
    container.insertBefore(end, start);
    expect(Array.from(handle.nodes())).toEqual([]);
    end.remove();
    expect(Array.from(handle.nodes())).toEqual([]);
    handle.dispose();
    expect(handle.rects()).toEqual([]);
    vi.restoreAllMocks();
  });

  it("runs ref cleanup once and closes observers when mounting fails", () => {
    const observer = mockObserver();
    let handle!: DOMRangeHandle;
    const container = document.createElement("div");
    expect(() =>
      render(
        <Show
          when={true}
          ref={(value) => {
            if (value === null) return;
            handle = value;
            value.observe(observer);
            throw new Error("ref failure");
          }}
        >
          <b />
        </Show>,
        container,
      ),
    ).toThrow("ref failure");
    expect(handle.disposed).toBe(true);
    expect(observer.unobserve).toHaveBeenCalledTimes(1);

    const cleanup = vi.fn();
    const ref = vi.fn((value: DOMRangeHandle | null) =>
      value === null ? undefined : cleanup,
    );
    const dispose = render(
      <Show when={true} ref={ref}>
        <b />
      </Show>,
      container,
    );
    dispose();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenLastCalledWith(null);
  });

  it("cancels component and model work with their owners", () => {
    const [visible, setVisible] = signal(true);
    let componentSignal!: AbortSignal;
    function Child() {
      componentSignal = useAbortSignal();
      expect(useAbortSignal()).toBe(componentSignal);
      return <b />;
    }
    const dispose = render(
      <Show when={visible}>
        <Child />
      </Show>,
      document.createElement("div"),
    );
    expect(componentSignal.aborted).toBe(false);
    setVisible(false);
    expect(componentSignal.aborted).toBe(true);
    const makeModel = defineModel((ctx) => {
      const signal = ctx.signal;
      return { work: { signal: ctx.read(() => signal) } };
    });
    const model = makeModel();
    expect(model.work.signal().aborted).toBe(false);
    const modelSignal = model.work.signal();
    model.dispose();
    expect(modelSignal.aborted).toBe(true);
    dispose();
  });
});
