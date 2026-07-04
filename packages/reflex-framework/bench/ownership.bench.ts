import { bench, describe } from "vitest";
import {
  addCleanup,
  contextLookup,
  createContext,
  createOwnerContext,
  createOwnershipNode,
  detach,
  disposeOwnershipNode,
  prependChild,
  provideContext,
  runWithOwner,
} from "../src/ownership";

let sink = 0;

function consume(value: unknown): void {
  sink ^= typeof value === "number" ? value : value === null ? 0 : 1;
}

function makeChain(depth: number) {
  const root = createOwnershipNode();
  let leaf = root;

  for (let index = 1; index < depth; index += 1) {
    const child = createOwnershipNode();
    prependChild(leaf, child);
    leaf = child;
  }

  return { root, leaf };
}

function makeContextChain(depth: number, value: number) {
  const target = createContext(0);
  const filler = createContext(0);
  const root = createOwnershipNode();
  provideContext(root, target, value);
  let leaf = root;

  for (let index = 1; index < depth; index += 1) {
    const child = createOwnershipNode();
    prependChild(leaf, child);
    provideContext(child, filler, index);
    leaf = child;
  }

  return { context: target, leaf };
}

function makeWideTree(childCount: number, withCleanup: boolean) {
  const root = createOwnershipNode();

  for (let index = 0; index < childCount; index += 1) {
    const child = createOwnershipNode();
    if (withCleanup) addCleanup(child, () => {});
    prependChild(root, child);
  }

  return root;
}

describe("ownership: owner scope", () => {
  const owner = createOwnerContext();
  const node = createOwnershipNode();

  bench("runWithOwner", () => {
    runWithOwner(owner, node, () => consume(owner.currentNode));
  });
});

describe("ownership: tree primitives", () => {
  const parent = createOwnershipNode();
  const children = Array.from({ length: 1_024 }, () => createOwnershipNode());

  bench("prepend + detach / 1024", () => {
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      prependChild(parent, child);
      detach(child);
    }
    consume(parent.firstChild);
  });
});

describe("ownership: context lookup", () => {
  const context = createContext(0);
  const ownNode = createOwnershipNode();
  provideContext(ownNode, context, 42);

  const inherited8 = makeChain(8);
  provideContext(inherited8.root, context, 42);

  const inherited64 = makeChain(64);
  provideContext(inherited64.root, context, 42);

  const recordChain64 = makeContextChain(64, 42);

  bench("own value", () => consume(contextLookup(ownNode, context)));
  bench("inherited / depth 8", () =>
    consume(contextLookup(inherited8.leaf, context)),
  );
  bench("inherited / depth 64", () =>
    consume(contextLookup(inherited64.leaf, context)),
  );
  bench("record chain / depth 64", () =>
    consume(contextLookup(recordChain64.leaf, recordChain64.context)),
  );
});

describe("ownership: disposal", () => {
  bench("wide / 1024 nodes", () => {
    disposeOwnershipNode(makeWideTree(1_023, false));
  });

  bench("wide + cleanup / 1024 nodes", () => {
    disposeOwnershipNode(makeWideTree(1_023, true));
  });

  bench("deep / 1024 nodes", () => {
    disposeOwnershipNode(makeChain(1_024).root);
  });
});
