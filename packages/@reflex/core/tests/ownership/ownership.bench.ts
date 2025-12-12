import { bench, describe } from "vitest";
import { OwnershipService } from "../../src/ownership/ownership.node";
import type { OwnershipNode } from "../../src/ownership/ownership.node";

const service = new OwnershipService();

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
    const root = service.createOwner(null);
    for (let i = 0; i < 100; i++) {
      service.createOwner(root);
    }
    service.dispose(root);
  });

  bench("register 100 cleanups", () => {
    const owner = service.createOwner(null);
    for (let i = 0; i < 100; i++) {
      service.onScopeCleanup(owner, () => {});
    }
    service.dispose(owner);
  });

  bench("register 10k cleanups and dispose", () => {
    const owner = service.createOwner(null);
    for (let i = 0; i < 10_000; i++) {
      service.onScopeCleanup(owner, () => {});
    }
    service.dispose(owner);
  });

  bench("build balanced tree (depth 6 × width 3)", () => {
    const root = service.createOwner(null);
    let layer: OwnershipNode[] = [root];

    for (let d = 0; d < 6; d++) {
      const next: OwnershipNode[] = [];
      for (const parent of layer) {
        for (let i = 0; i < 3; i++) {
          next.push(service.createOwner(parent));
        }
      }
      layer = next;
    }

    service.dispose(root);
  });

  bench("build wide tree (3000 siblings)", () => {
    const root = service.createOwner(null);
    for (let i = 0; i < 3000; i++) {
      service.createOwner(root);
    }
    service.dispose(root);
  });

  bench("build linear chain (depth 10k)", () => {
    let node = service.createOwner(null);
    const root = node;

    for (let i = 0; i < 10_000; i++) {
      node = service.createOwner(node);
    }

    service.dispose(root);
  });

  bench("context propagation (1000 depth, 100 reads)", () => {
    let node = service.createOwner(null);
    const root = node;

    for (let i = 0; i < 1000; i++) {
      node = service.createOwner(node);
    }

    service.provide(node, "value", 42);

    for (let i = 0; i < 100; i++) {
      service.inject(node, "value");
    }

    service.dispose(root);
  });

  bench("context override isolation (100 children)", () => {
    const root = service.createOwner(null);
    service.provide(root, "key", 0);

    for (let i = 0; i < 100; i++) {
      const child = service.createOwner(root);
      service.provide(child, "key", i);
      service.inject(child, "key");
      service.inject(root, "key");
    }

    service.dispose(root);
  });

  bench("interleaved append/remove (1000 ops)", () => {
    const root = service.createOwner(null);
    const list: OwnershipNode[] = [];

    for (let i = 0; i < 1000; i++) {
      const child = service.createOwner(root);
      list.push(child);

      if (i % 5 === 0 && list.length > 1) {
        const toRemove = list.shift()!;
        service.removeChild(root, toRemove);
      }
    }

    service.dispose(root);
  });

  bench("simulate UI component tree", () => {
    const root = service.createOwner(null);

    // Header
    const header = service.createOwner(root);
    for (let i = 0; i < 50; i++) service.createOwner(header);

    // Main
    const main = service.createOwner(root);
    for (let s = 0; s < 10; s++) {
      const section = service.createOwner(main);
      for (let i = 0; i < 20; i++) {
        service.createOwner(section);
      }
    }

    // Footer
    const footer = service.createOwner(root);
    for (let i = 0; i < 30; i++) service.createOwner(footer);

    service.dispose(root);
  });

  bench("subscription cleanup pattern (100 cleanups)", () => {
    const owner = service.createOwner(null);

    for (let i = 0; i < 100; i++) {
      service.onScopeCleanup(owner, () => {});
    }

    service.dispose(owner);
  });
});
