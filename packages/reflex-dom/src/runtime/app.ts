import type { Cleanup, JSXRenderable } from "../types";
import { createDOMRenderer, type DOMRenderer } from "./renderer";
import type { DOMRuntimeOptions } from "./options";
import { useDOMRenderer } from "./singleton";

export interface ReflexDOMApp {
  readonly renderer: DOMRenderer;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  hydrate(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  resume(container: ParentNode & Node): Cleanup;
  use(): void;
}

export function createApp(options?: DOMRuntimeOptions): ReflexDOMApp {
  const renderer = createDOMRenderer(options);

  return Object.freeze({
    renderer,
    render: renderer.render.bind(renderer),
    hydrate: renderer.hydrate.bind(renderer),
    mount: renderer.mount.bind(renderer),
    resume: renderer.resume.bind(renderer),
    use() {
      useDOMRenderer(renderer);
    },
  });
}

export function setupDOM(options?: DOMRuntimeOptions): ReflexDOMApp {
  const app = createApp(options);
  app.use();
  return app;
}
