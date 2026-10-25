/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import {
  createApp,
  createContext,
  createPort,
  isReleased,
  onCleanup,
  Provider,
  render,
  setupDOM,
  Show,
  useCallbackContext,
  useContext,
  useLease,
  useOwned,
  useOwnedSignal,
  usePortEndpoint,
  useSignal,
  useTransfer,
  type DomainPort,
  type OwnedSignal,
  type PortEndpoint,
} from "../src";

const strategies: EffectStrategy[] = ["eager", "sab", "flush"];

describe.each(strategies)("callback scopes (%s)", (effectStrategy) => {
  it("C4: resources created by an event handler close with its component", () => {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    const Theme = createContext("default");
    const log: string[] = [];

    function Button() {
      return (
        <button
          onClick={() => {
            log.push(`theme:${useContext(Theme)}`);
            useOwned(
              () => "subscription",
              () => log.push("owned"),
            );
            onCleanup(() => log.push("cleanup"));
          }}
        />
      );
    }

    const dispose = app.render(
      <Provider context={Theme} value="dark">
        <Button />
      </Provider>,
      container,
    );
    container.querySelector("button")!.click();
    expect(log).toEqual(["theme:dark"]);
    dispose();
    expect(log).toEqual(["theme:dark", "cleanup", "owned"]);
    app.dispose();
  });

  it("C4: a handler in a branch releases with that branch", () => {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    const log: string[] = [];
    let setVisible!: (value: boolean) => void;

    function View() {
      const visible = useSignal(true);
      setVisible = visible;
      return (
        <Show when={visible}>
          <button onClick={() => onCleanup(() => log.push("branch"))} />
        </Show>
      );
    }

    app.render(<View />, container);
    container.querySelector("button")!.click();
    setVisible(false);
    app.renderer.flush();
    expect(log).toEqual(["branch"]);
    app.dispose();
  });

  it("C5: useCallbackContext re-enters the component for timers and observers", () => {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    const log: string[] = [];
    let tick!: (value: number) => number | undefined;

    function Clock() {
      const count = useSignal(0);
      tick = useCallbackContext((value: number) => {
        onCleanup(() => log.push(`cleanup:${value}`));
        count(value);
        return value * 2;
      });
      return <span>{count}</span>;
    }

    const dispose = app.render(<Clock />, container);
    expect(tick(1)).toBe(2);
    app.renderer.flush();
    expect(container.textContent).toBe("1");
    dispose();
    expect(log).toEqual(["cleanup:1"]);
    expect(tick(2)).toBeUndefined();
    expect(log).toEqual(["cleanup:1"]);
    app.dispose();
  });

  it("C6: a bound continuation restores the owner after await", async () => {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    const Theme = createContext("default");
    const log: string[] = [];
    let loaded!: Promise<void>;

    function Loader() {
      const label = useSignal("loading");
      const resume = useCallbackContext((value: string) => {
        log.push(`${value}:${useContext(Theme)}`);
        onCleanup(() => log.push("released"));
        label(value);
      });
      loaded = Promise.resolve("ready").then(resume);
      return <span>{label}</span>;
    }

    const dispose = app.render(
      <Provider context={Theme} value="dark">
        <Loader />
      </Provider>,
      container,
    );
    await loaded;
    app.renderer.flush();
    expect(container.textContent).toBe("ready");
    expect(log).toEqual(["ready:dark"]);
    dispose();
    expect(log).toEqual(["ready:dark", "released"]);
    app.dispose();
  });

  it("C7: owned signals follow their component, leases and transfers", () => {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    let shared!: OwnedSignal<number>;
    let moved!: OwnedSignal<number>;
    let setOwner!: (value: boolean) => void;

    function Owner() {
      shared = useOwnedSignal(1);
      moved = useOwnedSignal(2);
      return <span>{shared}</span>;
    }

    function Borrower() {
      useLease(shared);
      useTransfer(moved);
      return <b />;
    }

    function View() {
      const owner = useSignal(true);
      setOwner = owner;
      return (
        <div>
          <Show when={owner}>
            <Owner />
          </Show>
          <Borrower />
        </div>
      );
    }

    const dispose = app.render(<View />, container);
    expect(container.textContent).toBe("1");
    setOwner(false);
    app.renderer.flush();
    expect(isReleased(shared)).toBe(false);
    expect(isReleased(moved)).toBe(false);
    dispose();
    expect(isReleased(shared)).toBe(true);
    expect(isReleased(moved)).toBe(true);
    app.dispose();
  });

  it("C8: two applications exchange snapshots through a port", async () => {
    const source = createApp({ effectStrategy });
    const target = createApp({ effectStrategy });
    const sourceContainer = document.createElement("div");
    const targetContainer = document.createElement("div");
    let from!: PortEndpoint;
    let port!: DomainPort<number>;

    function Publisher() {
      from = usePortEndpoint();
      return null;
    }

    function Reader() {
      port = createPort<number>(from, usePortEndpoint());
      return <span>{() => port.read() ?? "none"}</span>;
    }

    source.render(<Publisher />, sourceContainer);
    const disposeTarget = target.render(<Reader />, targetContainer);
    expect(targetContainer.textContent).toBe("none");
    port.publish(1);
    port.flush();
    target.renderer.flush();
    expect(targetContainer.textContent).toBe("1");
    disposeTarget();
    expect(port.closed).toBe(true);
    source.dispose();
    target.dispose();
  });

  it("C9: app.dispose releases every root and closes the runtime", () => {
    const app = createApp({ effectStrategy });
    const first = document.createElement("div");
    const second = document.createElement("div");
    const log: string[] = [];

    function Leaf({ name }: { name: string }) {
      onCleanup(() => log.push(name));
      return <span>{name}</span>;
    }

    const third = document.createElement("div");
    app.render(<Leaf name="first" />, first);
    app.render(<Leaf name="second" />, second);
    app.render(<Leaf name="replaced" />, second);
    const disposeThird = app.render(<Leaf name="third" />, third);
    disposeThird();
    expect(log).toEqual(["second", "third"]);
    app.dispose();
    expect(log).toEqual(["second", "third", "first", "replaced"]);
    expect(first.textContent).toBe("");
    expect(second.textContent).toBe("");
    expect(app.disposed).toBe(true);
    expect(app.renderer.execution.runtime.domain.closed).toBe(true);
    expect(() => app.render(<span />, first)).toThrow(
      "The DOM renderer is disposed.",
    );
    app.dispose();
  });

  it("C9: disposing the default application clears the default renderer", () => {
    const app = setupDOM({ effectStrategy });
    const container = document.createElement("div");
    app.dispose();
    const dispose = render(<span>fresh</span>, container);
    expect(container.textContent).toBe("fresh");
    dispose();
  });
});
