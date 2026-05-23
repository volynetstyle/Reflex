/** @jsxImportSource @volynets/reflex-dom */

import { createDOMRenderer, render } from "@volynets/reflex-dom";
import type { JSXRenderable } from "@volynets/reflex-dom";

export const createApplication = (App: JSXRenderable, container = "app") => {
  createDOMRenderer({
    effectStrategy: "sab",
  });

  queueMicrotask(() => {
    const root = document.getElementById(container);

    if (root === null) {
      throw new Error(
        "[createApplication]: No container provider or default container in index.html non exist!",
      );
    }

    render(App, root);
  });
};
