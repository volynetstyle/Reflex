import { bench, describe } from "vitest";
import { createOwner } from "#reflex/core/ownership/ownership.core.js";
import { IOwnership, OwnershipStateFlags } from "#reflex/core/ownership/ownership.type.js";

const noop = () => {};

function buildBalancedTree(depth: number, breadth: number, parent?: IOwnership): IOwnership {
  const node = createOwner(parent);
  if (depth > 0) {
    for (let i = 0; i < breadth; i++) buildBalancedTree(depth - 1, breadth, node);
  }
  return node;
}

describe("Ownership — Stress & System Microbench", () => {

  // ───────────────────────────────────────────────
  // Memory & Allocation efficiency
  // ───────────────────────────────────────────────
  bench("create 100 children and dispose", () => {
    const root = createOwner();
    for (let i = 0; i < 100; i++) createOwner(root);
    root.dispose();
  });

  bench("register 100 cleanups", () => {
    const owner = createOwner();
    for (let i = 0; i < 100; i++) owner.onScopeCleanup(noop);
  });

  bench("register 10k cleanups and dispose", () => {
    const owner = createOwner();
    for (let i = 0; i < 10_000; i++) owner.onScopeCleanup(noop);
    owner.dispose();
  });

  // ───────────────────────────────────────────────
  // Tree topologies: deep, wide, balanced
  // ───────────────────────────────────────────────
  bench("build balanced tree (depth 6 × 3)", () => {
    const root = buildBalancedTree(6, 3);
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

  // ───────────────────────────────────────────────
  // Context propagation
  // ───────────────────────────────────────────────
  bench("context propagation 1000× deep", () => {
    let root = createOwner();
    root.provide("x", 42);
    for (let i = 0; i < 1000; i++) {
      const child = createOwner(root);
      root = child;
    }
    root.inject("x");
  });

  bench("context override isolation", () => {
    const root = createOwner();
    root.provide("data", { x: 1 });
    const a = createOwner(root);
    const b = createOwner(root);
    a.provide("data", { x: 999 });
    a.inject("data");
    b.inject("data");
  });

  // ───────────────────────────────────────────────
  // Concurrent-like mutation patterns
  // ───────────────────────────────────────────────
  bench("interleaved append/remove", () => {
    const parent = createOwner();
    const children: IOwnership[] = [];
    for (let i = 0; i < 1000; i++) {
      const c = createOwner();
      parent.appendChild(c);
      children.push(c);
      if (i % 3 === 0 && children.length > 1) {
        const idx = Math.floor(Math.random() * children.length);
        const target = children.splice(idx, 1)[0];
        parent.removeChild(target);
      }
    }
    parent.dispose();
  });

  // ───────────────────────────────────────────────
  // Realistic composition: simulated component trees
  // ───────────────────────────────────────────────
  bench("simulate UI component tree (header/main/footer)", () => {
    const app = createOwner();

    const header = createOwner(app);
    createOwner(header);
    createOwner(header);

    const main = createOwner(app);
    for (let i = 0; i < 50; i++) {
      const item = createOwner(main);
      item.onScopeCleanup(noop);
    }

    const footer = createOwner(app);
    app.dispose();
  });

  bench("subscription cleanup pattern (100 subs)", () => {
    const owner = createOwner();
    const fns: (() => void)[] = [];
    for (let i = 0; i < 100; i++) {
      const unsub = () => {};
      fns.push(unsub);
      owner.onScopeCleanup(unsub);
    }
    owner.dispose();
  });

  // // ───────────────────────────────────────────────
  // // Stress scenario: tree + errors + callbacks
  // // ───────────────────────────────────────────────
  // bench("mixed workload (tree + cleanups + errors)", () => {
  //   const root = buildBalancedTree(3, 5);
  //   let counter = 0;
  //   root.onScopeCleanup(() => counter++);
  //   for (let i = 0; i < 500; i++) {
  //     const child = createOwner(root);
  //     child.onScopeCleanup(() => {
  //       counter++;
  //       if (i % 100 === 0) throw new Error("boom");
  //     });
  //   }
  //   root.dispose();
  // });

});
