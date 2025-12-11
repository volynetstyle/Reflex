import { describe, it, expect } from "vitest";
import {
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
  unlinkAllObserversUnsafe,
  unlinkAllSourcesUnsafe,
} from "../../src/graph/process/graph.intrusive";

import { GraphNode, GraphEdge } from "../../src/graph/graph.node";

// helpers
function collectOutEdges(node: GraphNode): GraphEdge[] {
  const result: GraphEdge[] = [];
  let cur = node.firstOut;
  while (cur) {
    result.push(cur);
    cur = cur.nextOut;
  }
  return result;
}

function collectInEdges(node: GraphNode): GraphEdge[] {
  const result: GraphEdge[] = [];
  let cur = node.firstIn;
  while (cur) {
    result.push(cur);
    cur = cur.nextIn;
  }
  return result;
}

describe("Edge-based Intrusive Graph", () => {

  it("creates symmetric edge between source and observer", () => {
    const source = new GraphNode();
    const observer = new GraphNode();

    const e = linkSourceToObserverUnsafe(source, observer);

    // OUT adjacency
    expect(source.firstOut).toBe(e);
    expect(source.lastOut).toBe(e);
    expect(source.outCount).toBe(1);

    // IN adjacency
    expect(observer.firstIn).toBe(e);
    expect(observer.lastIn).toBe(e);
    expect(observer.inCount).toBe(1);

    // symmetry
    expect(e.from).toBe(source);
    expect(e.to).toBe(observer);
  });

  it("supports multiple observers for one source", () => {
    const source = new GraphNode();
    const o1 = new GraphNode();
    const o2 = new GraphNode();
    const o3 = new GraphNode();

    const e1 = linkSourceToObserverUnsafe(source, o1);
    const e2 = linkSourceToObserverUnsafe(source, o2);
    const e3 = linkSourceToObserverUnsafe(source, o3);

    const chain = collectOutEdges(source);

    expect(chain.length).toBe(3);
    expect(chain[0]).toBe(e1);
    expect(chain[1]).toBe(e2);
    expect(chain[2]).toBe(e3);

    expect(chain[0].nextOut).toBe(chain[1]);
    expect(chain[1].nextOut).toBe(chain[2]);
    expect(chain[2].nextOut).toBe(null);

    expect(chain[1].prevOut).toBe(chain[0]);
    expect(chain[2].prevOut).toBe(chain[1]);
  });

  it("supports multiple sources for one observer", () => {
    const observer = new GraphNode();
    const s1 = new GraphNode();
    const s2 = new GraphNode();
    const s3 = new GraphNode();

    const e1 = linkSourceToObserverUnsafe(s1, observer);
    const e2 = linkSourceToObserverUnsafe(s2, observer);
    const e3 = linkSourceToObserverUnsafe(s3, observer);

    const chain = collectInEdges(observer);

    expect(chain.length).toBe(3);
    expect(chain[0]).toBe(e1);
    expect(chain[1]).toBe(e2);
    expect(chain[2]).toBe(e3);

    expect(chain[0].nextIn).toBe(chain[1]);
    expect(chain[1].nextIn).toBe(chain[2]);
    expect(chain[2].nextIn).toBe(null);
  });

  it("unlinkSourceFromObserverUnsafe removes only matching edge", () => {
    const observer = new GraphNode();
    const source = new GraphNode();

    linkSourceToObserverUnsafe(source, observer);

    expect(observer.inCount).toBe(1);

    unlinkSourceFromObserverUnsafe(source, observer);

    expect(observer.inCount).toBe(0);
    expect(observer.firstIn).toBeNull();
    expect(observer.lastIn).toBeNull();

    expect(source.firstOut).toBeNull();
    expect(source.lastOut).toBeNull();
    expect(source.outCount).toBe(0);
  });

  it("unlinkSourceFromObserverUnsafe removes middle of out-list", () => {
    const observer = new GraphNode();
    const s1 = new GraphNode();
    const s2 = new GraphNode();
    const s3 = new GraphNode();

    linkSourceToObserverUnsafe(s1, observer);
    linkSourceToObserverUnsafe(s2, observer);
    linkSourceToObserverUnsafe(s3, observer);

    unlinkSourceFromObserverUnsafe(s2, observer);

    const chain = collectInEdges(observer);

    expect(chain.length).toBe(2);
    expect(chain[0].from).toBe(s1);
    expect(chain[1].from).toBe(s3);
  });

  it("unlinkAllObserversUnsafe clears all out-edges", () => {
    const source = new GraphNode();
    const o1 = new GraphNode();
    const o2 = new GraphNode();
    const o3 = new GraphNode();

    linkSourceToObserverUnsafe(source, o1);
    linkSourceToObserverUnsafe(source, o2);
    linkSourceToObserverUnsafe(source, o3);

    expect(source.outCount).toBe(3);

    unlinkAllObserversUnsafe(source);

    expect(source.outCount).toBe(0);
    expect(source.firstOut).toBeNull();
    expect(source.lastOut).toBeNull();

    // every observer has no incoming edges now
    expect(o1.firstIn).toBeNull();
    expect(o2.firstIn).toBeNull();
    expect(o3.firstIn).toBeNull();
  });

  it("unlinkAllSourcesUnsafe clears all in-edges", () => {
    const observer = new GraphNode();
    const s1 = new GraphNode();
    const s2 = new GraphNode();
    const s3 = new GraphNode();

    linkSourceToObserverUnsafe(s1, observer);
    linkSourceToObserverUnsafe(s2, observer);
    linkSourceToObserverUnsafe(s3, observer);

    expect(observer.inCount).toBe(3);

    unlinkAllSourcesUnsafe(observer);

    expect(observer.inCount).toBe(0);
    expect(observer.firstIn).toBeNull();
    expect(observer.lastIn).toBeNull();

    expect(s1.firstOut).toBeNull();
    expect(s2.firstOut).toBeNull();
    expect(s3.firstOut).toBeNull();
  });

});
