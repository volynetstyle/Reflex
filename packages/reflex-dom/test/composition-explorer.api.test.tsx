/** @jsxImportSource ../src */

import { getActiveOwnerContext } from "@volynets/reflex-framework";
import { describe, expect, it } from "vitest";
import * as api from "../src";

function structureScenario() {
  const app = api.createApp();
  const container = document.createElement("div");
  const target = document.createElement("aside");
  let setItems!: (items: number[]) => void;
  let setVisible!: (value: boolean) => void;
  let setTarget!: (node: Element | null) => void;

  function View() {
    const items = api.useSignal([1, 2]);
    const visible = api.useSignal(true);
    const portalTarget = api.useSignal<Element | null>(target);
    setItems = items;
    setVisible = visible;
    setTarget = portalTarget;
    return (
      <main>
        <api.Show when={visible} fallback={<span>hidden</span>}>
          <ul>
            <api.For each={items} by={(item) => item}>
              {(item) => <li data-id={item}>{item}</li>}
            </api.For>
          </ul>
        </api.Show>
        <api.Switch
          value={visible}
          cases={[{ when: true, children: <b>on</b> }]}
          fallback={<b>off</b>}
        />
        <api.Portal to={portalTarget}>
          <em>portal</em>
        </api.Portal>
      </main>
    );
  }

  const dispose = app.render(<View />, container);
  const stable = container.querySelector('[data-id="2"]');
  expect(container.textContent).toBe("12on");
  expect(target.textContent).toBe("portal");
  app.renderer.batch(() => setItems([2, 3]));
  expect(container.textContent).toBe("23on");
  expect(container.querySelector('[data-id="2"]')).toBe(stable);
  app.renderer.batch(() => setVisible(false));
  expect(container.textContent).toBe("hiddenoff");
  app.renderer.batch(() => setTarget(null));
  expect(target.textContent).toBe("");
  app.renderer.batch(() => setTarget(target));
  expect(target.textContent).toBe("portal");
  dispose();
  expect(container.textContent).toBe("");
  expect(target.textContent).toBe("");
}

function hooksContextScenario() {
  const Theme = api.createContext("default");
  const Locale = api.createContext<string>();
  const app = api.createApp();
  const container = document.createElement("div");
  const events: string[] = [];
  let setCount!: (value: number) => void;

  function Child() {
    return <span>{api.useContext(Theme)}</span>;
  }

  function LocaleLabel() {
    return <i>{api.useContext(Locale) ?? "none"}</i>;
  }

  function View() {
    api.provideContext(Theme, "provided");
    expect(api.useContext(Theme)).toBe("provided");
    const count = api.useSignal(1);
    setCount = count;
    const doubled = api.useComputed(() => count() * 2);
    const memo = api.useMemo(() => doubled() + 1);
    const ref = api.useRef(0);
    api.useOwned(
      () => "resource",
      (resource) => events.push(`dispose:${resource}`),
    );
    api.useEffectOnce(() => events.push("once"));
    api.useMount(() => events.push("mount"));
    api.useUnmount(() => events.push("unmount"));
    api.onCleanup(() => events.push("onCleanup"));
    api.useEffect(() => {
      events.push(`untracked:${api.untracked(count)}`);
    });
    api.useEffect(() => {
      const value = memo();
      ref.current = value;
      events.push(`effect:${value}`);
      return () => events.push(`cleanup:${value}`);
    });
    api.useMountedEffect(() => {
      events.push(`mounted:${container.textContent}`);
    });
    return (
      <div>
        <Child />:{memo}
        <api.Provider context={Locale} value="uk">
          <LocaleLabel />
        </api.Provider>
        <LocaleLabel />
      </div>
    );
  }

  const dispose = app.render(<View />, container);
  expect(container.textContent).toBe("provided:3uknone");
  expect(events).toContain("once");
  expect(events).toContain("mount");
  expect(events).toContain("effect:3");
  expect(events).toContain("mounted:provided:3uknone");
  app.renderer.batch(() => setCount(2));
  expect(container.textContent).toBe("provided:5uknone");
  expect(events).toContain("cleanup:3");
  expect(events).toContain("effect:5");
  expect(events.filter((event) => event.startsWith("untracked:"))).toEqual([
    "untracked:1",
  ]);
  expect(events).not.toContain("onCleanup");
  dispose();
  expect(events).toContain("unmount");
  expect(events.filter((event) => event === "onCleanup")).toHaveLength(1);
  expect(events).toContain("dispose:resource");
  expect(events).toContain("cleanup:5");
  expect(events.filter((event) => event === "once")).toHaveLength(1);
}

function jsxRuntimeScenario() {
  const children = [
    api.jsx("span", { children: "one" }),
    api.jsxDEV("span", { children: "two" }),
  ];
  const fragment = api.jsx(api.Fragment, { children });
  const tree = api.jsxs("main", { children: fragment });
  expect(api.renderToString(tree)).toBe(
    "<main><span>one</span><span>two</span></main>",
  );
  const app = api.createApp();
  const container = document.createElement("div");
  const dispose = app.render(tree, container);
  expect(container.querySelector("main")?.outerHTML).toBe(
    "<main><span>one</span><span>two</span></main>",
  );
  dispose();
}

function clientScenario() {
  const isolated = api.createDOMRenderer();
  const first = document.createElement("div");
  const firstDispose = isolated.mount(<p>isolated</p>, first);
  expect(first.textContent).toBe("isolated");
  firstDispose();

  const app = api.createApp();
  api.useDOMRenderer(app.renderer);
  const second = document.createElement("div");
  const secondDispose = api.mount(<p>default</p>, second);
  expect(second.textContent).toBe("default");
  const resumedDispose = api.resume(second);
  expect(second.textContent).toBe("default");
  resumedDispose();
  secondDispose();

  const third = document.createElement("div");
  third.innerHTML = api.renderToString(<p>hydrated</p>);
  const hydrateDispose = api.hydrate(<p>hydrated</p>, third);
  expect(third.textContent).toBe("hydrated");
  hydrateDispose();

  api.createDOMRuntime();
  const fourth = document.createElement("div");
  const renderDispose = api.render(<p>runtime</p>, fourth);
  expect(fourth.textContent).toBe("runtime");
  renderDispose();

  api.setupDOM();
  const fifth = document.createElement("div");
  const setupDispose = api.render(<p>setup</p>, fifth);
  expect(fifth.textContent).toBe("setup");
  setupDispose();
  api.useDOMRenderer(null);
}

function modelScenario() {
  const events: string[] = [];
  const resource = { [Symbol.dispose]: () => events.push("resource") };
  const createCounter = api.defineModel((ctx) => {
    let count = 1;
    api.own(ctx, resource);
    ctx.onDispose(() => events.push("model"));
    return {
      count: ctx.read(() => count),
      increment: ctx.action(() => ++count),
    };
  });
  const model = createCounter();
  expect(api.isModel(model)).toBe(true);
  expect(api.isModelReadableValue(model.count)).toBe(true);
  expect(api.isModelActionValue(model.increment)).toBe(true);
  expect(api.readModelValue(model.count)).toBe(1);
  expect(api.readModelValue(42)).toBe(42);
  model.increment();
  expect(api.readModelValue(model.count)).toBe(2);
  model.dispose();
  expect(events).toEqual(["resource", "model"]);
}

function cancellationRangeScenario() {
  const app = api.createApp();
  const container = document.createElement("div");
  let lifetime!: AbortSignal;
  const ref = { current: null as api.DOMRangeHandle | null };
  function View() {
    lifetime = api.useAbortSignal();
    expect(api.getLifetimeSignal(getActiveOwnerContext()!.currentNode!)).toBe(
      lifetime,
    );
    return (
      <api.Show when={true} ref={ref}>
        <b>owned</b>
      </api.Show>
    );
  }
  const dispose = app.render(<View />, container);
  const handle = ref.current!;
  expect(Array.from(handle.nodes()).map((node) => node.textContent)).toEqual([
    "owned",
  ]);
  expect(lifetime.aborted).toBe(false);
  dispose();
  expect(lifetime.aborted).toBe(true);
  expect(handle.disposed).toBe(true);
  expect(ref.current).toBeNull();

  const start = document.createComment("start");
  const end = document.createComment("end");
  const text = document.createTextNode("standalone");
  container.append(start, text, end);
  const standalone = api.createDOMRangeHandle(start, end);
  expect(Array.from(standalone.nodes())).toEqual([text]);
  standalone.dispose();
  expect(Array.from(standalone.nodes())).toEqual([]);
  expect(container.textContent).toBe("standalone");
}

function managedLifetimeScenario() {
  const source = api.createApp();
  const target = api.createApp();
  const log: string[] = [];
  let from!: api.PortEndpoint;
  let port!: api.DomainPort<number>;
  let later!: () => void;

  function Publisher() {
    from = api.usePortEndpoint();
    const owned = api.useOwnedSignal(1);
    const doubled = api.useOwnedComputed(() => owned() * 2);
    owned.set(2);
    expect(doubled()).toBe(4);
    later = api.useCallbackContext(() => {
      api.onCleanup(() => log.push(`released:${api.isReleased(owned)}`));
    });
    return null;
  }

  function Reader() {
    port = api.createPort<number>(from, api.usePortEndpoint());
    return <span>{() => port.read() ?? "none"}</span>;
  }

  function Borrower({ handle }: { handle: api.OwnedValue<number> }) {
    api.useLease(handle);
    return null;
  }

  function Adopter({ handle }: { handle: api.OwnedValue<number> }) {
    api.useTransfer(handle);
    return null;
  }

  const sourceContainer = document.createElement("div");
  const targetContainer = document.createElement("div");
  source.render(<Publisher />, sourceContainer);
  target.render(<Reader />, targetContainer);
  later();
  port.publish(3);
  port.flush();
  expect(targetContainer.textContent).toBe("3");

  function Owner() {
    const handle = api.useOwnedSignal(0);
    return (
      <>
        <Borrower handle={handle} />
        <Adopter handle={api.useOwnedSignal(0)} />
      </>
    );
  }
  source.render(<Owner />, document.createElement("div"));
  source.dispose();
  target.dispose();
  expect(log).toEqual(["released:false"]);
  expect(port.closed).toBe(true);
  expect(() => port.publish(4)).toThrow(api.PortClosedError);
  expect(new api.PortOverflowError()).toBeInstanceOf(Error);
  expect(new api.PortTopologyError()).toBeInstanceOf(Error);
  expect(new api.ReleasedResourceError()).toBeInstanceOf(Error);
  expect(new api.BorrowError("borrow")).toBeInstanceOf(Error);
}

const scenarioRegistry = {
  structure: structureScenario,
  hooksContext: hooksContextScenario,
  jsxRuntime: jsxRuntimeScenario,
  client: clientScenario,
  model: modelScenario,
  cancellationRange: cancellationRangeScenario,
  managedLifetime: managedLifetimeScenario,
} as const;

// Each public runtime export points to a function that Vitest executes below.
// New exports require an explicit registry entry at compile time and runtime.
const scenarios = {
  For: scenarioRegistry.structure,
  Portal: scenarioRegistry.structure,
  Show: scenarioRegistry.structure,
  Switch: scenarioRegistry.structure,
  createContext: scenarioRegistry.hooksContext,
  Provider: scenarioRegistry.hooksContext,
  provideContext: scenarioRegistry.hooksContext,
  useComputed: scenarioRegistry.hooksContext,
  useContext: scenarioRegistry.hooksContext,
  useEffect: scenarioRegistry.hooksContext,
  useEffectOnce: scenarioRegistry.hooksContext,
  useMemo: scenarioRegistry.hooksContext,
  useMount: scenarioRegistry.hooksContext,
  useOwned: scenarioRegistry.hooksContext,
  useRef: scenarioRegistry.hooksContext,
  useSignal: scenarioRegistry.hooksContext,
  useUnmount: scenarioRegistry.hooksContext,
  onCleanup: scenarioRegistry.hooksContext,
  untracked: scenarioRegistry.hooksContext,
  useCallbackContext: scenarioRegistry.managedLifetime,
  useLease: scenarioRegistry.managedLifetime,
  useOwnedComputed: scenarioRegistry.managedLifetime,
  useOwnedSignal: scenarioRegistry.managedLifetime,
  useTransfer: scenarioRegistry.managedLifetime,
  usePortEndpoint: scenarioRegistry.managedLifetime,
  createPort: scenarioRegistry.managedLifetime,
  isReleased: scenarioRegistry.managedLifetime,
  BorrowError: scenarioRegistry.managedLifetime,
  PortClosedError: scenarioRegistry.managedLifetime,
  PortOverflowError: scenarioRegistry.managedLifetime,
  PortTopologyError: scenarioRegistry.managedLifetime,
  ReleasedResourceError: scenarioRegistry.managedLifetime,
  useMountedEffect: scenarioRegistry.hooksContext,
  Fragment: scenarioRegistry.jsxRuntime,
  jsx: scenarioRegistry.jsxRuntime,
  jsxDEV: scenarioRegistry.jsxRuntime,
  jsxs: scenarioRegistry.jsxRuntime,
  createApp: scenarioRegistry.client,
  setupDOM: scenarioRegistry.client,
  createDOMRuntime: scenarioRegistry.client,
  hydrate: scenarioRegistry.client,
  mount: scenarioRegistry.client,
  render: scenarioRegistry.client,
  resume: scenarioRegistry.client,
  useDOMRenderer: scenarioRegistry.client,
  createDOMRenderer: scenarioRegistry.client,
  renderToString: scenarioRegistry.jsxRuntime,
  defineModel: scenarioRegistry.model,
  isModel: scenarioRegistry.model,
  isModelActionValue: scenarioRegistry.model,
  isModelReadableValue: scenarioRegistry.model,
  own: scenarioRegistry.model,
  readModelValue: scenarioRegistry.model,
  createDOMRangeHandle: scenarioRegistry.cancellationRange,
  getLifetimeSignal: scenarioRegistry.cancellationRange,
  useAbortSignal: scenarioRegistry.cancellationRange,
} satisfies Record<
  keyof typeof api,
  (typeof scenarioRegistry)[keyof typeof scenarioRegistry]
>;

describe("public API composition explorer", () => {
  it("maps every runtime export to an executable scenario", () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(scenarios).sort());
    expect(new Set(Object.values(scenarios))).toEqual(
      new Set(Object.values(scenarioRegistry)),
    );
  });

  it.each(Object.entries(scenarioRegistry))(
    "executes %s scenario",
    (_name, run) => run(),
  );
});
