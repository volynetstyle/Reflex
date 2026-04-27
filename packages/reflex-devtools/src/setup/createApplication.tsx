/** @jsxImportSource @volynets/reflex-dom */

import { createDOMRenderer, render } from "@volynets/reflex-dom";
import type { JSXRenderable } from "@volynets/reflex-dom";

export const createApplication = (App: JSXRenderable, container = "app") => {
  createDOMRenderer({
    effectStrategy: "sab",
  });

  queueMicrotask(() => {
    const root = document.getElementById(container);

    if (root !== null) {
      render(App, root);
    }
  });
};
