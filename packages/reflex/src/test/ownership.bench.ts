import { bench, describe } from "vitest";
import { createOwner } from "#reflex/core/ownership/ownership.core.js";
import { OwnershipStateFlags } from "#reflex/core/ownership/ownership.type.js";

// утилита, чтобы случайно не зависнуть
function buildTree(depth: number, width: number) {
  const root = createOwner();
  const queue = [root];
  for (let d = 0; d < depth; d++) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i++) {
      const parent = queue.shift()!;
      for (let j = 0; j < width; j++) {
        const child = createOwner(parent);
        queue.push(child);
      }
    }
  }
  return root;
}

describe("Ownership — Microbench", () => {
  bench("create 100 children and dispose", () => {
    const root = createOwner();
    for (let i = 0; i < 100; i++) createOwner(root);
    root.dispose();
  });

  bench("register 100 cleanups", () => {
    const owner = createOwner();
    for (let i = 0; i < 100; i++) owner.onScopeCleanup(() => {});
  });

  bench("register 10k cleanups and dispose", () => {
    const owner = createOwner();
    for (let i = 0; i < 10_000; i++) owner.onScopeCleanup(() => {});
    owner.dispose();
  });

  bench("build balanced tree (depth 6 × 3)", () => {
    const root = buildTree(6, 3);
    root.dispose();
  });

  bench("build wide tree (3000 siblings)", () => {
    const root = createOwner();
    for (let i = 0; i < 3000; i++) createOwner(root);
    root.dispose();
  });

  bench("build linear chain (depth 10k)", () => {
    let node = createOwner();
    const root = node;
    for (let i = 0; i < 10_000; i++) node = createOwner(node);
    root.dispose();
  });

  bench("context propagation 1000× deep", () => {
    let node = createOwner();
    for (let i = 0; i < 1000; i++) node = createOwner(node);
    node.provide("x", 42);
    let cur = node;
    while (cur._parent) cur = cur._parent;
    cur.getContext();
  });

  bench("context override isolation", () => {
    const parent = createOwner();
    parent.provide("value", 1);
    const child = createOwner(parent);
    child.provide("value", 2);
    parent.inject("value");
    child.inject("value");
  });

  bench("interleaved append/remove", () => {
    const root = createOwner();
    const nodes = [];
    for (let i = 0; i < 1000; i++) {
      const n = createOwner(root);
      nodes.push(n);
      if (i % 3 === 0) root.removeChild(n);
    }
    root.dispose();
  });

  bench("simulate UI component tree (header/main/footer)", () => {
    const root = createOwner();
    const header = createOwner(root);
    const main = createOwner(root);
    const footer = createOwner(root);
    for (let i = 0; i < 500; i++) {
      createOwner(header);
      createOwner(main);
      createOwner(footer);
    }
    root.dispose();
  });

  bench("subscription cleanup pattern (100 subs)", () => {
    const owner = createOwner();
    for (let i = 0; i < 100; i++) {
      let active = true;
      owner.onScopeCleanup(() => (active = false));
    }
    owner.dispose();
  });
});
