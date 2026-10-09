import type { Cleanup, JSXRenderable } from "../types";
import { createDOMRenderer, type DOMRenderer } from "./renderer";
import type { DOMRuntimeOptions } from "../runtime/options";
import { useDOMRenderer } from "./default";

export interface ReflexDOMApp {
  readonly renderer: DOMRenderer;
  render(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  hydrate(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  mount(input: JSXRenderable, container: ParentNode & Node): Cleanup;
  resume(container: ParentNode & Node): Cleanup;
  use(): void;
}

/**
 * Creates an isolated DOM application with its own renderer and runtime. Its
 * methods do not register it as the module's default renderer.
 *
 * @remarks
 * **When to use:** for multiple applications on one page, isolated runtimes, or
 * explicit renderer control.
 * **When not to use:** for a single default-renderer setup; use `setupDOM` to
 * create and register that renderer.
 *
 * @param options Effect strategy and host hook options.
 */
export function createApp(options?: DOMRuntimeOptions): ReflexDOMApp {
  const renderer = createDOMRenderer(options);

  return Object.freeze({
    renderer,
    render: renderer.render,
    hydrate: renderer.hydrate,
    mount: renderer.mount,
    resume: renderer.resume,
    use() {
      useDOMRenderer(renderer);
    },
  });
}

/**
 * Creates an application and registers its renderer as the module's default.
 *
 * @remarks
 * **When to use:** when one renderer should be active for APIs and integrations
 * that consume the default renderer.
 * **When not to use:** when multiple independent renderers are needed or
 * changing the default renderer is undesirable; use `createApp`.
 *
 * @param options Effect strategy and host hook options.
 */
export function setupDOM(options?: DOMRuntimeOptions): ReflexDOMApp {
  const app = createApp(options);
  app.use();
  return app;
}
