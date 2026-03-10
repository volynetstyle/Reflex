import { bench, describe } from "vitest";
import { OwnershipNode } from "../../src/ownership/ownership.node";
import type { OwnershipNode as IOwnershipNode } from "../../src/ownership/ownership.node";

/**
 * Ownership System Microbenchmarks
 *
 * Measures hot-path ownership operations:
 * - creation
 * - structural mutations
 * - cleanup execution
 * - context propagation
 */

describe("Ownership — Microbench", () => {
  bench("create 100 children and dispose", () => {
    const root = OwnershipNode.createRoot();
    for (let i = 0; i < 100; i++) {
      root.createChild();
    }
    root.dispose();
  });

  bench("register 100 cleanups", () => {
    const owner = OwnershipNode.createRoot();
    for (let i = 0; i < 100; i++) {
      owner.onCleanup(() => {});
    }
    owner.dispose();
  });

  bench("register 10k cleanups and dispose", () => {
    const owner = OwnershipNode.createRoot();
    for (let i = 0; i < 10_000; i++) {
      owner.onCleanup(() => {});
    }
    owner.dispose();
  });

  bench("build balanced tree (depth 6 × width 3)", () => {
    const root = OwnershipNode.createRoot();
    let layer: IOwnershipNode[] = [root];

    for (let d = 0; d < 6; d++) {
      const next: IOwnershipNode[] = [];
      for (const parent of layer) {
        for (let i = 0; i < 3; i++) {
          next.push(parent.createChild());
        }
      }
      layer = next;
    }

    root.dispose();
  });

  bench("build wide tree (3000 siblings)", () => {
    const root = OwnershipNode.createRoot();
    for (let i = 0; i < 3000; i++) {
      root.createChild();
    }
    root.dispose();
  });

  bench("build linear chain (depth 10k)", () => {
    let node = OwnershipNode.createRoot();
    const root = node;

    for (let i = 0; i < 10_000; i++) {
      node = node.createChild();
    }

    root.dispose();
  });

  bench("context propagation (1000 depth, 100 reads)", () => {
    let node = OwnershipNode.createRoot();
    const root = node;

    for (let i = 0; i < 1000; i++) {
      node = node.createChild();
    }

    node.provide("value", 42);

    for (let i = 0; i < 100; i++) {
      node.inject("value");
    }

    root.dispose();
  });

  bench("context override isolation (100 children)", () => {
    const root = OwnershipNode.createRoot();
    root.provide("key", 0);

    for (let i = 0; i < 100; i++) {
      const child = root.createChild();
      child.provide("key", i);
      child.inject("key");
      root.inject("key");
    }

    root.dispose();
  });

  bench("interleaved append/remove (1000 ops)", () => {
    const root = OwnershipNode.createRoot();
    const list: IOwnershipNode[] = [];

    for (let i = 0; i < 1000; i++) {
      const child = root.createChild();
      list.push(child);

      if (i % 5 === 0 && list.length > 1) {
        const toRemove = list.shift()!;
        toRemove.removeFromParent();
      }
    }

    root.dispose();
  });

  bench("simulate UI component tree", () => {
    const root = OwnershipNode.createRoot();

    // Header
    const header = root.createChild();
    for (let i = 0; i < 50; i++) header.createChild();

    // Main
    const main = root.createChild();
    for (let s = 0; s < 10; s++) {
      const section = main.createChild();
      for (let i = 0; i < 20; i++) {
        section.createChild();
      }
    }

    // Footer
    const footer = root.createChild();
    for (let i = 0; i < 30; i++) footer.createChild();

    root.dispose();
  });

  bench("subscription cleanup pattern (100 cleanups)", () => {
    const owner = OwnershipNode.createRoot();

    for (let i = 0; i < 100; i++) {
      owner.onCleanup(() => {});
    }

    owner.dispose();
  });
});
