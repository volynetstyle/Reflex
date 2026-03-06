import { describe, expect, it } from "vitest";
import {
  INVALID,
  ReactiveNode,
  ReactiveNodeState,
  VISITED,
} from "../../src/reactivity/shape";
import { connect } from "../../src/reactivity/shape/methods/connect";
import {
  propagate,
  recuperate,
} from "../../src/reactivity/walkers/propagateFrontier";

export function node(id: string): ReactiveNode {
  return new ReactiveNode(0, undefined as any, null, null);
}

describe("Walkers", () => {
  it("push invalidates children", () => {
    const A = node("A");
    const B = node("B");

    connect(A, B);

    A.v = 10;

    propagate(A);

    expect(B.runtime & INVALID).toBeTruthy();
  });

  it("push propagates through diamond", () => {
    const A = node("A");
    const B = node("B");
    const C = node("C");
    const D = node("D");

    connect(A, B);
    connect(A, C);
    connect(B, D);
    connect(C, D);

    A.v = 1;

    propagate(A);

    expect(B.runtime & INVALID).toBeTruthy();
    expect(C.runtime & INVALID).toBeTruthy();
  });

  it("pull traverses dependencies", () => {
    const A = node("A");
    const B = node("B");
    const C = node("C");

    connect(A, B);
    connect(B, C);

    B.runtime |= ReactiveNodeState.Invalid;

    const result = recuperate(C);

    expect(result).toBeTruthy();
  });

  it("visited prevents duplicate traversal", () => {
    const A = node("A");
    const B = node("B");
    const C = node("C");
    const D = node("D");

    connect(A, B);
    connect(A, C);
    connect(B, D);
    connect(C, D);

    B.runtime |= ReactiveNodeState.Invalid;

    recuperate(D);

    expect(A.runtime & VISITED).toBeTruthy();
  });

  it("frontier ordering prevents stale propagation", () => {
    const A = node("A");
    const B = node("B");

    connect(A, B);

    A.v = 5;
    B.frontier = 10;

    propagate(A);

    expect(B.frontier).toBe(10);
  });

  it("push enqueues node only once", () => {
    const A = node("A");
    const B = node("B");

    connect(A, B);

    A.v = 1;

    propagate(A);
    propagate(A);

    expect(B.runtime & ReactiveNodeState.Invalid).toBeTruthy();
  });
});
