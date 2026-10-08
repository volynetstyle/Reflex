/** @jsxImportSource @volynets/reflex-dom */
import { createDOMRenderer } from "@volynets/reflex-dom";
import type { JSXRenderable } from "@volynets/reflex-dom";

export const createApplication = (App: JSXRenderable, container = "app") => {
  const renderer = createDOMRenderer({ effectStrategy: "sab" });
  let disposed = false;
  let unmount: (() => void) | undefined;
  const dispose = () => {
    disposed = true;
    unmount?.();
    unmount = undefined;
  };
  queueMicrotask(() => {
    if (disposed) return;
    const root = document.getElementById(container);
    if (root === null) throw new Error("[createApplication]: Missing container #" + container);
    unmount = renderer.render(App, root);
  });
  import.meta.hot?.dispose(dispose);
  return dispose;
};
