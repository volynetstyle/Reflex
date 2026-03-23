import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  RECYCLER_INITIAL_STATE,
} from "@reflex/runtime";
import { describe, expect, it } from "vitest";
import { ReactiveNodeState } from "../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import {
  UNINITIALIZED,
  createComputedNode,
  createEffectNode,
  createScanNode,
  createSignalNode,
  createSource,
} from "../src/infra/factory";

describe("Reactive system - factory helpers", () => {
  it("creates producer nodes for signals and scans", () => {
    const signalNode = createSignalNode(1);
    const scanNode = createScanNode(2);

    expect(signalNode.payload).toBe(1);
    expect(signalNode.pendingPayload).toBe(1);
    expect(signalNode.state).toBe(PRODUCER_INITIAL_STATE);

    expect(scanNode.payload).toBe(2);
    expect(scanNode.pendingPayload).toBe(2);
    expect(scanNode.state).toBe(PRODUCER_INITIAL_STATE);
  });

  it("creates computed nodes with uninitialized payload", () => {
    const compute = () => 42;
    const node = createComputedNode(compute);

    expect(node.compute).toBe(compute);
    expect(node.state).toBe(CONSUMER_INITIAL_STATE);
    expect(node.payload).toBe(UNINITIALIZED);
    expect(node.pendingPayload).toBe(UNINITIALIZED);
  });

  it("creates effect nodes with watcher state", () => {
    const compute = () => {};
    const node = createEffectNode(compute);

    expect(node.compute).toBe(compute);
    expect(node.state).toBe(RECYCLER_INITIAL_STATE);
    expect(node.state & ReactiveNodeState.Watcher).toBeTruthy();
    expect(node.payload).toBeNull();
  });

  it("creates empty event sources", () => {
    const source = createSource<number>();

    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });
});
