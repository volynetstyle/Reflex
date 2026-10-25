import { describe, expect, it } from "vitest";
import {
  addCleanup,
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  onCleanup,
  runWithOwner,
  runWithOwnershipNode,
} from "../src";

describe("onCleanup", () => {
  it("runs once on disposal, in reverse registration order", () => {
    const owner = createOwnerContext();
    const node = createOwnershipNode();
    const log: string[] = [];

    runWithOwnershipNode(owner, node, () => {
      onCleanup(() => log.push("first"));
      onCleanup(() => log.push("second"));
    });

    expect(log).toEqual([]);
    disposeOwnershipNode(node);
    disposeOwnershipNode(node);
    expect(log).toEqual(["second", "first"]);
  });

  it("attaches to the innermost active node", () => {
    const owner = createOwnerContext();
    const parent = createOwnershipNode();
    const child = createOwnershipNode();
    const log: string[] = [];

    runWithOwnershipNode(owner, parent, () => {
      runWithOwnershipNode(owner, child, () => {
        onCleanup(() => log.push("child"));
      });
    });

    disposeOwnershipNode(child);
    expect(log).toEqual(["child"]);
    disposeOwnershipNode(parent);
    expect(log).toEqual(["child"]);
  });

  it("is ignored without an owner", () => {
    let calls = 0;
    expect(() => onCleanup(() => calls++)).not.toThrow();
    expect(calls).toBe(0);
  });

  it("runs immediately when entered on a node that is already closing", () => {
    const owner = createOwnerContext();
    const node = createOwnershipNode();
    const log: string[] = [];

    runWithOwnershipNode(owner, node, () => undefined);
    addCleanup(node, () => {
      runWithOwner(owner, node, () => {
        onCleanup(() => log.push("late"));
      });
      log.push("cleanup");
    });

    disposeOwnershipNode(node);
    expect(log).toEqual(["late", "cleanup"]);
  });
});
