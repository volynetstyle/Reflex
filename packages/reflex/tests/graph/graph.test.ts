import { describe, it, expect } from "vitest";
import {
  linkEdge,
  unlinkEdge,
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
} from "../../src/core/graph/utils/graph.linker";
import { unlinkAllObserversUnsafe, unlinkAllSourcesUnsafe } from "../../src/core/graph/utils/graph.intrusive";
import { IReactiveNode, GraphNode } from "../../src/core/graph/graph.node";

function makeNode(): IReactiveNode {
  const node = new GraphNode();
  return node;
}

const collectSourceChain = (head: IReactiveNode | null): IReactiveNode[] => {
  const result: IReactiveNode[] = [];
  let cur = head;
  while (cur) {
    result.push(cur);
    cur = cur._nextSource;
  }
  return result;
};

const collectObserverChain = (
  head: IReactiveNode | null
): IReactiveNode[] => {
  const result: IReactiveNode[] = [];
  let cur = head;
  while (cur) {
    result.push(cur);
    cur = cur._nextObserver;
  }
  return result;
};

describe("graph_linker: linkEdge / unlinkSourceFromObserverUnsafe", () => {
  it("creates symmetric edge between observer and source", () => {
    const observer = makeNode();
    const source = makeNode();

    linkEdge(observer, source);

    expect(observer._firstSource).toBe(source);
    expect(observer._lastSource).toBe(source);
    expect(source._prevSource).toBeNull();
    expect(source._nextSource).toBeNull();
    expect(observer._sourceCount).toBe(1);

    expect(source._firstObserver).toBe(observer);
    expect(source._lastObserver).toBe(observer);
    expect(observer._prevObserver).toBeNull();
    expect(observer._nextObserver).toBeNull();
    expect(source._observerCount).toBe(1);
  });

  it("supports multiple different sources for one observer", () => {
    const observer = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    linkEdge(observer, s1);
    linkEdge(observer, s2);
    linkEdge(observer, s3);

    const chain = collectSourceChain(observer._firstSource);

    expect(chain.length).toBe(3);
    expect(chain[0]).toBe(s1);
    expect(chain[1]).toBe(s2);
    expect(chain[2]).toBe(s3);

    expect(chain[0]!._prevSource).toBeNull();
    expect(chain[0]!._nextSource).toBe(chain[1]);
    expect(chain[1]!._prevSource).toBe(chain[0]);
    expect(chain[1]!._nextSource).toBe(chain[2]);
    expect(chain[2]!._prevSource).toBe(chain[1]);
    expect(chain[2]!._nextSource).toBeNull();

    expect(observer._sourceCount).toBe(3);
  });

  it("supports multiple observers for one source", () => {
    const source = makeNode();
    const o1 = makeNode();
    const o2 = makeNode();
    const o3 = makeNode();

    linkEdge(o1, source);
    linkEdge(o2, source);
    linkEdge(o3, source);

    const chain = collectObserverChain(source._firstObserver);

    expect(chain.length).toBe(3);
    expect(chain[0]).toBe(o1);
    expect(chain[1]).toBe(o2);
    expect(chain[2]).toBe(o3);

    expect(chain[0]!._prevObserver).toBeNull();
    expect(chain[0]!._nextObserver).toBe(chain[1]);
    expect(chain[1]!._prevObserver).toBe(chain[0]);
    expect(chain[1]!._nextObserver).toBe(chain[2]);
    expect(chain[2]!._prevObserver).toBe(chain[1]);
    expect(chain[2]!._nextObserver).toBeNull();

    expect(source._observerCount).toBe(3);
  });

  it("unlinkSourceFromObserverUnsafe removes edge from both lists", () => {
    const observer = makeNode();
    const source = makeNode();

    linkEdge(observer, source);
    unlinkSourceFromObserverUnsafe(source, observer);

    expect(observer._firstSource).toBeNull();
    expect(observer._lastSource).toBeNull();
    expect(observer._sourceCount).toBe(0);

    expect(source._firstObserver).toBeNull();
    expect(source._lastObserver).toBeNull();
    expect(source._observerCount).toBe(0);

    expect(source._prevSource).toBeNull();
    expect(source._nextSource).toBeNull();
    expect(observer._prevObserver).toBeNull();
    expect(observer._nextObserver).toBeNull();
  });

  it("unlinkSourceFromObserverUnsafe removes middle of list", () => {
    const observer = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    linkEdge(observer, s1);
    linkEdge(observer, s2);
    linkEdge(observer, s3);

    unlinkSourceFromObserverUnsafe(s2, observer);

    const chain = collectSourceChain(observer._firstSource);
    expect(chain.length).toBe(2);
    expect(chain[0]).toBe(s1);
    expect(chain[1]).toBe(s3);

    expect(chain[0]!._nextSource).toBe(chain[1]);
    expect(chain[1]!._prevSource).toBe(chain[0]);

    expect(observer._sourceCount).toBe(2);
  });

  it("unlinkAllObserversUnsafe removes all observers", () => {
    const source = makeNode();
    const o1 = makeNode();
    const o2 = makeNode();
    const o3 = makeNode();

    linkEdge(o1, source);
    linkEdge(o2, source);
    linkEdge(o3, source);

    expect(source._observerCount).toBe(3);

    unlinkAllObserversUnsafe(source);

    expect(source._firstObserver).toBeNull();
    expect(source._lastObserver).toBeNull();
    expect(source._observerCount).toBe(0);

    expect(o1._prevObserver).toBeNull();
    expect(o1._nextObserver).toBeNull();
    expect(o2._prevObserver).toBeNull();
    expect(o2._nextObserver).toBeNull();
    expect(o3._prevObserver).toBeNull();
    expect(o3._nextObserver).toBeNull();
  });

  it("unlinkAllSourcesUnsafe removes all sources", () => {
    const observer = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    linkEdge(observer, s1);
    linkEdge(observer, s2);
    linkEdge(observer, s3);

    expect(observer._sourceCount).toBe(3);

    unlinkAllSourcesUnsafe(observer);

    expect(observer._firstSource).toBeNull();
    expect(observer._lastSource).toBeNull();
    expect(observer._sourceCount).toBe(0);

    expect(s1._prevSource).toBeNull();
    expect(s1._nextSource).toBeNull();
    expect(s2._prevSource).toBeNull();
    expect(s2._nextSource).toBeNull();
    expect(s3._prevSource).toBeNull();
    expect(s3._nextSource).toBeNull();
  });

  it("linkSourceToObserverUnsafe and unlinkEdge work together", () => {
    const observer = makeNode();
    const source = makeNode();

    linkSourceToObserverUnsafe(source, observer);
    expect(observer._sourceCount).toBe(1);
    expect(source._observerCount).toBe(1);

    unlinkEdge(observer, source);
    expect(observer._sourceCount).toBe(0);
    expect(source._observerCount).toBe(0);
  });
});
