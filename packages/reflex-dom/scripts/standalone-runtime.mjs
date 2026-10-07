import assert from "node:assert/strict";
import * as dom from "@volynets/reflex-dom/standalone";
import {
  Fragment,
  jsx,
  jsxs,
} from "@volynets/reflex-dom/standalone/jsx-runtime";
import {
  Fragment as DevFragment,
  jsxDEV,
} from "@volynets/reflex-dom/standalone/jsx-dev-runtime";

// The DOM test host is supplied by the harness; the renderer resolves only its
// own files from an isolated node_modules, outside the workspace.
const { JSDOM } = await import(process.argv[2]);
assert.equal(jsx, dom.jsx);
assert.equal(jsxs, dom.jsxs);
assert.equal(jsxDEV, dom.jsxDEV);
assert.equal(Fragment, dom.Fragment);
assert.equal(DevFragment, Fragment);

// Import the actual published artifact, with no Vite aliases or browser globals.
for (const effectStrategy of ["eager", "sab", "flush"]) {
  const window = new JSDOM("<!doctype html><main></main>").window;
  const container = window.document.querySelector("main");
  const renderer = dom.createDOMRenderer({ effectStrategy });
  const log = [];
  const rangeRef = { current: null };
  let lifetime;
  let set;
  function Counter() {
    lifetime = dom.useAbortSignal();
    assert.equal(dom.useAbortSignal(), lifetime);
    const value = dom.useSignal(0);
    set = value;
    dom.useMountedEffect(() => {
      log.push(container.textContent);
    });
    return dom.Show({
      when: true,
      ref: rangeRef,
      children: jsx("button", {
        children: value,
        onClick: () => value((n) => n + 1),
      }),
    });
  }

  try {
    const dispose = renderer.render(jsxDEV(Counter, {}), container);
    const range = rangeRef.current;
    assert.equal(lifetime.aborted, false);
    assert.equal(
      Array.from(range.nodes())[0],
      container.querySelector("button"),
    );
    assert.equal(container.textContent, "0", `${effectStrategy}: initial DOM`);
    assert.deepEqual(log, ["0"], `${effectStrategy}: mounted effect`);
    container.querySelector("button").click();
    if (effectStrategy === "flush") await Promise.resolve();
    assert.equal(
      container.textContent,
      "1",
      `${effectStrategy}: event delivery`,
    );
    renderer.batch(() => set(2));
    renderer.flush();
    assert.equal(
      container.textContent,
      "2",
      `${effectStrategy}: explicit flush`,
    );
    dispose();
    assert.equal(lifetime.aborted, true);
    assert.equal(rangeRef.current, null);
    assert.equal(range.disposed, true);
    assert.deepEqual(Array.from(range.nodes()), []);
    renderer.batch(() => set(3));
    await Promise.resolve();
    assert.equal(
      container.childNodes.length,
      0,
      `${effectStrategy}: disposed bindings`,
    );

    const view = dom.jsx("p", { children: () => "server" });
    container.innerHTML = dom.renderToString(view);
    const paragraph = container.querySelector("p");
    const cleanup = renderer.hydrate(view, container);
    assert.equal(
      container.querySelector("p"),
      paragraph,
      `${effectStrategy}: hydration identity`,
    );
    cleanup();

    const start = window.document.createComment("start");
    const end = window.document.createComment("end");
    const text = window.document.createTextNode("range");
    container.append(start, text, end);
    const standaloneRange = dom.createDOMRangeHandle(start, end);
    assert.deepEqual(Array.from(standaloneRange.nodes()), [text]);
    standaloneRange.dispose();
    assert.equal(container.textContent, "range");
  } finally {
    window.close();
  }
}

assert.equal(
  dom.renderToString(dom.jsx("span", { children: "<ok>" })),
  "<span>&lt;ok&gt;</span>",
);
console.log(
  "Standalone artifact passed: all delivery strategies, DOM events, effects, lifetime cancellation, range refs, disposal, SSR and hydration.",
);
