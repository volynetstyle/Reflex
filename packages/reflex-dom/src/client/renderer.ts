import { createOwnershipNode } from "@volynets/reflex-framework";
import { hydrateRange } from "../hydrate/hydration";
import { mountOwnedRange } from "../mount/range";
import { createOwnedRange } from "../structure/owned-range";
import type { Cleanup, JSXRenderable } from "../types";
import type { DOMRuntimeOptions } from "../runtime/options";
import type { MountEffects } from "../runtime/mount-effects";
import {
  createDOMContext,
  runDOMOperation,
  type DOMContext,
} from "../runtime/context";
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
  /** `true` after `dispose()`. */
  readonly disposed: boolean;
  /**
   * Disposes every root this renderer still owns, then closes its execution
   * domain. Later render, hydrate, mount and resume calls throw.
   */
  dispose(): void;
}

export function createDOMRenderer(options?: DOMRuntimeOptions): DOMRenderer {
  const execution = createDOMContext(options);
  // The latest disposer per container; replacing a root retires the old one.
  const roots = new Map<Container, Cleanup>();
  let disposed = false;
  const track = (container: Container, dispose: Cleanup): Cleanup => {
    const tracked = (() => {
      // dispose() already released this root and closed the domain.
      if (disposed) return;
      if (roots.get(container) === tracked) roots.delete(container);
      dispose();
    }) as Cleanup;
    tracked.dispose = tracked;
    roots.set(container, tracked);
    return tracked;
  };
  const operation = (container: Container, fn: () => Cleanup): Cleanup => {
    if (disposed) throw new Error("The DOM renderer is disposed.");
    let dispose: Cleanup | undefined;
    try {
      return track(
        container,
        runDOMOperation(execution, () => (dispose = fn())),
      );
    } catch (error) {
      // Mounted effects can fail while the public operation's batch closes.
      dispose?.();
      throw error;
    }
  };
  const render = (input: JSXRenderable, container: Container) =>
    operation(container, () =>
      replaceRoot(execution, container, (anchors) =>
        mountOwnedRange(container, input, "html", anchors),
      ),
    );

  return {
    execution,
    mountEffects: execution.mountEffects,
    run: (fn) => execution.runtime.run(fn),
    batch: (fn) => execution.runtime.batch(fn),
    flush: () => execution.runtime.flush(),
    hydrate(input, container) {
      return operation(container, () =>
        replaceRoot(
          execution,
          container,
          (anchors) => hydrateRange(input, container, anchors),
          true,
        ),
      );
    },
    render,
    mount: render,
    resume(container) {
      return operation(
        container,
        () =>
          existingRootCleanup(execution, container) ??
          replaceRoot(
            execution,
            container,
            (anchors) => createOwnedRange(createOwnershipNode(), anchors),
            true,
          ),
      );
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      const owned = Array.from(roots.values());
      try {
        for (const dispose of owned) dispose();
      } finally {
        disposed = true;
        roots.clear();
        execution.runtime.domain.close();
      }
    },
  };
}
