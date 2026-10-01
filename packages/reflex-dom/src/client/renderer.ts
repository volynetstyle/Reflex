import { createOwnershipNode } from "@volynets/reflex-framework";
import { hydrateRange } from "../hydrate/hydration";
import { mountOwnedRange } from "../mount/range";
import { createOwnedRange } from "../structure/owned-range";
import type { Cleanup, JSXRenderable } from "../types";
import type { DOMRuntimeOptions } from "../runtime/options";
import type { MountEffects } from "../runtime/mount-effects";
import { createDOMContext, type DOMContext } from "../runtime/context";
import { existingRootCleanup, replaceRoot } from "./roots";

type Container = ParentNode & Node;

export interface DOMRenderer {
  readonly execution: DOMContext;
  readonly mountEffects: MountEffects;
  run<T>(fn: () => T): T;
  batch<T>(fn: () => T): T;
  flush(): void;
  hydrate(input: JSXRenderable, container: Container): Cleanup;
  render(input: JSXRenderable, container: Container): Cleanup;
  mount(input: JSXRenderable, container: Container): Cleanup;
  resume(container: Container): Cleanup;
}

export function createDOMRenderer(options?: DOMRuntimeOptions): DOMRenderer {
  const execution = createDOMContext(options);
  const render = (input: JSXRenderable, container: Container) =>
    replaceRoot(execution, container, (anchors) =>
      mountOwnedRange(container, input, "html", anchors),
    );

  return {
    execution,
    mountEffects: execution.mountEffects,
    run: execution.runtime.run,
    batch: execution.runtime.batch,
    flush: execution.runtime.flush,
    hydrate(input, container) {
      return replaceRoot(
        execution,
        container,
        (anchors) => hydrateRange(input, container, anchors),
        true,
      );
    },
    render,
    mount: render,
    resume(container) {
      return (
        existingRootCleanup(execution, container) ??
        replaceRoot(
          execution,
          container,
          (anchors) => createOwnedRange(createOwnershipNode(), anchors),
          true,
        )
      );
    },
  };
}
