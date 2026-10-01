import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as dom from "../dist/index.js";

// Import the actual published artifact, with no Vite aliases or browser globals.
for (const effectStrategy of ["eager", "sab", "flush"]) {
  const window = new JSDOM("<!doctype html><main></main>").window;
  const container = window.document.querySelector("main");
  const renderer = dom.createDOMRenderer({ effectStrategy });
  const log = [];
  let set;
  function Counter() {
    const value = dom.useSignal(0);
    set = value;
    dom.useMountedEffect(() => {
      log.push(container.textContent);
    });
    return dom.jsx("button", {
      children: value,
      onClick: () => value((n) => n + 1),
    });
  }

  try {
    const dispose = renderer.render(dom.jsx(Counter, {}), container);
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
  } finally {
    window.close();
  }
}

assert.equal(
  dom.renderToString(dom.jsx("span", { children: "<ok>" })),
  "<span>&lt;ok&gt;</span>",
);
for (const name of ["index.js", "index.d.ts"]) {
  const source = await readFile(
    new URL(`../dist/${name}`, import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:from\s*|import\s*\()["']@volynets\//,
    `${name}: external workspace dependency`,
  );
}
console.log(
  "Standalone artifact passed: all delivery strategies, DOM events, effects, disposal, SSR and hydration.",
);
