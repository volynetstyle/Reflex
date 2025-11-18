// ownership.run.ts
// Стенд без Vitest. Чистый прогон операций Ownership для профилировщиков.
// Запуск для 0x:
// pnpm exec 0x -- node dist/tests/ownership.run.js
// или:
// node --require ts-node/register/transpile-only tests/ownership.run.ts

import { createOwner } from "../../src/core/ownership/ownership.core";

// ===========================
// helpers
// ===========================
function buildTree(depth: number, width: number) {
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
}

// ===========================
// individual tasks
// ===========================

function runCreate10000Children() {
  const root = createOwner();
  for (let i = 0; i < 10_000; i++) createOwner(root);
  root.dispose();
}

function runAppendRemoveMixed10000() {
  const root = createOwner();
  const list = [];
  for (let i = 0; i < 10_000; i++) {
    const n = createOwner(root);
    list.push(n);
    if (i % 4 === 0) root.removeChild(n);
  }
  root.dispose();
}

function runLinear10000() {
  let node = createOwner();
  const root = node;
  for (let i = 0; i < 10_000; i++) node = createOwner(node);
  root.dispose();
}

function runWide10000() {
  const root = createOwner();
  for (let i = 0; i < 10_000; i++) createOwner(root);
  root.dispose();
}

function runBalancedDeepTree() {
  const root = buildTree(6, 10); // примерно 111k узлов
  root.dispose();
}

function runContextPropagation10000() {
  let node = createOwner();
  for (let i = 0; i < 10_000; i++) node = createOwner(node);

  node.provide("v", 123);

  let cur = node;
  while (cur._parent) cur = cur._parent;

  cur.getContext();
}

function runContextOverride10000() {
  const root = createOwner();
  root.provide("x", 1);

  for (let i = 0; i < 10_000; i++) {
    const child = createOwner(root);
    child.provide("x", i);
    child.inject("x");
    root.inject("x");
  }
}

function runRegisterCleanups10000() {
  const owner = createOwner();
  for (let i = 0; i < 10_000; i++) {
    owner.onScopeCleanup(() => {});
  }
  owner.dispose();
}

function runRegisterAndDisposeLargeCleanups() {
  const owner = createOwner();
  for (let i = 0; i < 10_000; i++) {
    owner.onScopeCleanup(() => {});
  }
  owner.dispose();
}

// ===========================
// Main workload
// ===========================

console.log("Warmup...");
for (let i = 0; i < 5; i++) {
  runCreate10000Children();
  runLinear10000();
  runWide10000();
}

console.log("Running main 10k benchmark load...");
for (let i = 0; i < 50; i++) runCreate10000Children();

for (let i = 0; i < 50; i++) runAppendRemoveMixed10000();

for (let i = 0; i < 20; i++) runLinear10000();

for (let i = 0; i < 20; i++) runWide10000();

for (let i = 0; i < 20; i++) runBalancedDeepTree();

for (let i = 0; i < 50; i++) runContextPropagation10000();

for (let i = 0; i < 50; i++) runContextOverride10000();

for (let i = 0; i < 20; i++) runRegisterCleanups10000();

for (let i = 0; i < 20; i++) runRegisterAndDisposeLargeCleanups();

console.log("Ownership run complete.");
