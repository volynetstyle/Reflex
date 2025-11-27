import { bench, describe } from "vitest";
import { createOwner } from "../../src/ownership/ownership.core";

/**
 * Ownership System Microbenchmarks
 *
 * Detailed performance profiling of hot-path operations.
 * Comparable structure to reference benchmarks for direct performance comparison.
 */

describe("Ownership — Microbench", () => {
  bench("create 100 children and dispose", () => {
    const root = createOwner();
    for (let i = 0; i < 100; i++) {
      createOwner(root);
    }
    (root as any).dispose();
  });

  bench("register 100 cleanups", () => {
    const owner = createOwner();
    for (let i = 0; i < 100; i++) {
      owner.onScopeCleanup(() => {});
    }
  });

  bench("register 10k cleanups and dispose", () => {
    const owner = createOwner();
    for (let i = 0; i < 10_000; i++) {
      owner.onScopeCleanup(() => {});
    }
    (owner as any).dispose();
  });

  bench("build balanced tree (depth 6 × 3)", () => {
    const buildTree = (depth: number, width: number) => {
      const root = createOwner();
      let layer = [root];
      for (let d = 0; d < depth; d++) {
        const next: any[] = [];
        for (const parent of layer) {
          for (let i = 0; i < width; i++) {
            next.push(createOwner(parent));
          }
        }
        layer = next;
      }
      return root;
    };

    const root = buildTree(6, 3); // 1 + 3 + 9 + 27 + 81 + 243 + 729 = 1093 nodes
    (root as any).dispose();
  });

  bench("build wide tree (3000 siblings)", () => {
    const root = createOwner();
    for (let i = 0; i < 3000; i++) {
      createOwner(root);
    }
    (root as any).dispose();
  });

  bench("build linear chain (depth 10k)", () => {
    let node = createOwner();
    const root = node;
    for (let i = 0; i < 10_000; i++) {
      node = createOwner(node);
    }
    (root as any).dispose();
  });

  bench("context propagation 1000× deep", () => {
    let node = createOwner();
    const root = node;
    for (let i = 0; i < 1000; i++) {
      node = createOwner(node);
    }

    node.provide("value", 42);

    for (let i = 0; i < 100; i++) {
      node.inject("value");
    }

    (root as any).dispose();
  });

  bench("context override isolation", () => {
    const root = createOwner();
    root.provide("key", 0);

    for (let i = 0; i < 100; i++) {
      const child = createOwner(root);
      child.provide("key", i);
      child.inject("key");
      root.inject("key");
    }

    (root as any).dispose();
  });

  bench("interleaved append/remove", () => {
    const root = createOwner();
    const list: any[] = [];

    for (let i = 0; i < 1000; i++) {
      const child = createOwner(root);
      list.push(child);

      if (i % 5 === 0 && list.length > 1) {
        const toRemove = list.shift();
        root.removeChild(toRemove);
      }
    }

    (root as any).dispose();
  });

  bench("simulate UI component tree (header/main/footer)", () => {
    const root = createOwner();

    // Header: 50 components
    const header = createOwner(root);
    for (let i = 0; i < 50; i++) createOwner(header);

    // Main: 200 components (10 sections × 20 items)
    const main = createOwner(root);
    for (let s = 0; s < 10; s++) {
      const section = createOwner(main);
      for (let i = 0; i < 20; i++) createOwner(section);
    }

    // Footer: 30 components
    const footer = createOwner(root);
    for (let i = 0; i < 30; i++) createOwner(footer);

    (root as any).dispose();
  });

  bench("subscription cleanup pattern (100 subs)", () => {
    const owner = createOwner();

    // Simulate 100 subscriptions with cleanup
    for (let i = 0; i < 100; i++) {
      owner.onScopeCleanup(() => {
        // Cleanup: unsubscribe
      });
    }

    (owner as any).dispose();
  });
});
