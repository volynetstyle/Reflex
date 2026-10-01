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
  const app = api.createApp();
  const container = document.createElement("div");
  const events: string[] = [];
  let setCount!: (value: number) => void;

  function Child() {
    const owner = getActiveOwnerContext()!;
    expect(api.hasOwnContext(owner, Theme)).toBe(false);
    return <span>{api.useContext(owner, Theme)}</span>;
  }

  function View() {
    const owner = getActiveOwnerContext()!;
    api.provideContext(owner, Theme, "provided");
    expect(api.hasOwnContext(owner, Theme)).toBe(true);
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
      </div>
    );
  }

  const dispose = app.render(<View />, container);
  expect(container.textContent).toBe("provided:3");
  expect(events).toContain("once");
  expect(events).toContain("mount");
  expect(events).toContain("effect:3");
  expect(events).toContain("mounted:provided:3");
  app.renderer.batch(() => setCount(2));
  expect(container.textContent).toBe("provided:5");
  expect(events).toContain("cleanup:3");
  expect(events).toContain("effect:5");
  dispose();
  expect(events).toContain("unmount");
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

const scenarioRegistry = {
  structure: structureScenario,
  hooksContext: hooksContextScenario,
  jsxRuntime: jsxRuntimeScenario,
  client: clientScenario,
  model: modelScenario,
} as const;

// Each public runtime export points to a function that Vitest executes below.
// New exports require an explicit registry entry at compile time and runtime.
const scenarios = {
  For: scenarioRegistry.structure,
  Portal: scenarioRegistry.structure,
  Show: scenarioRegistry.structure,
  Switch: scenarioRegistry.structure,
  createContext: scenarioRegistry.hooksContext,
  hasOwnContext: scenarioRegistry.hooksContext,
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
