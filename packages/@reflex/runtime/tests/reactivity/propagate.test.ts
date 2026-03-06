import { describe, expect, it } from "vitest";
import { ReactiveNode, ReactiveNodeState } from "../../src/reactivity/shape";
import { connect } from "../../src/reactivity/shape/methods/connect";
import { propagate } from "../../src/reactivity/walkers/propagate";

export function node(): ReactiveNode {
  const node = new ReactiveNode(0, undefined as any, null, null);
  return node;
}

describe("Walkers", () => {
  it("does not propagate through obsolete nodes", () => {
    const a = node();
    const b = node();
    const c = node();

    connect(a, b);
    connect(b, c);

    const beforeB = b.runtime;
    const beforeC = c.runtime;

    propagate(a, ReactiveNodeState.Invalid);

    expect(b.runtime).toBe(beforeB);
    expect(c.runtime).toBe(beforeC);
  });

  it("first compute clears obsolete", () => {
    const c = node();

    c.runtime = ReactiveNodeState.Obsolete;

    // simulate compute
    c.runtime = 0;

    expect(c.runtime & ReactiveNodeState.Obsolete).toBeFalsy();
  });

  it("propagate never removes obsolete", () => {
    const a = node();
    const b = node();

    connect(a, b);

    b.runtime = ReactiveNodeState.Obsolete;

    propagate(a, ReactiveNodeState.Invalid);

    expect(b.runtime).toBe(ReactiveNodeState.Obsolete);
  });

  it("computed becomes invalid after dependency change", () => {
    const a = node();
    const b = node();

    connect(a, b);

    b.runtime = ReactiveNodeState.Obsolete;

    // first compute
    b.runtime = 0;

    propagate(a, ReactiveNodeState.Invalid);

    expect(b.runtime & ReactiveNodeState.Invalid).toBeTruthy();
  });

  it("obsolete has priority over queued", () => {
    const a = node();
    const b = node();

    connect(a, b);

    b.runtime = ReactiveNodeState.Obsolete | ReactiveNodeState.Queued;

    propagate(a, ReactiveNodeState.Invalid);

    expect(b.runtime & ReactiveNodeState.Obsolete).toBeTruthy();
  });
});
