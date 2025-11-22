import { describe, it, expect } from "vitest";
import { GraphNode } from "../../src/core/graph/graph.node";
import {
  linkEdge,
  unlinkEdge,
  unlinkAllObservers,
  forEachObserver,
  forEachSource,
  unlinkAllSources,
} from "../../src/core/graph/graph.operations";
import { linkPool } from "../../src/core/graph/graph.pool";

function makeNode() {
  return new GraphNode();
}

function collectObservers(node: GraphNode) {
  const result: GraphNode[] = [];
  forEachObserver(node, (n) => result.push(n));
  return result;
}

function collectSources(node: GraphNode) {
  const result: GraphNode[] = [];
  forEachSource(node, (n) => result.push(n));
  return result;
}

describe("LinkPool", () => {
  it("reuses released links", () => {
    const a = makeNode();
    const b = makeNode();

    const link = linkEdge(a, b);
    unlinkEdge(link);

    const sizeBefore = linkPool.size; // = 1
    const reused = linkEdge(a, b); // <-- size становится 0

    expect(linkPool.size).toBe(sizeBefore - 1);
    expect(reused).toBe(link);
  });
});

describe("linkEdge / unlinkEdge", () => {
  it("creates symmetric link", () => {
    const observer = makeNode();
    const source = makeNode();

    linkEdge(observer, source);

    expect(observer._sourceCount).toBe(1);
    expect(source._observerCount).toBe(1);

    const sources = collectSources(observer);
    const observers = collectObservers(source);

    expect(sources[0]).toBe(source);
    expect(observers[0]).toBe(observer);
  });

  it("supports multiple sources for one observer", () => {
    const o = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    linkEdge(o, s1);
    linkEdge(o, s2);
    linkEdge(o, s3);

    const sources = collectSources(o);

    expect(sources.length).toBe(3);
    expect(sources).toContain(s1);
    expect(sources).toContain(s2);
    expect(sources).toContain(s3);
    expect(o._sourceCount).toBe(3);
  });

  it("supports multiple observers for one source", () => {
    const s = makeNode();
    const o1 = makeNode();
    const o2 = makeNode();
    const o3 = makeNode();

    linkEdge(o1, s);
    linkEdge(o2, s);
    linkEdge(o3, s);

    const observers = collectObservers(s);

    expect(observers.length).toBe(3);
    expect(observers).toContain(o1);
    expect(observers).toContain(o2);
    expect(observers).toContain(o3);
    expect(s._observerCount).toBe(3);
  });

  it("can unlink middle link", () => {
    const o = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    void linkEdge(o, s1);
    const l2 = linkEdge(o, s2);
    void linkEdge(o, s3);

    unlinkEdge(l2);

    const sources = collectSources(o);

    expect(sources.length).toBe(2);
    expect(sources).toContain(s1);
    expect(sources).toContain(s3);
    expect(sources).not.toContain(s2);
    expect(o._sourceCount).toBe(2);
  });

  it("unlinks all sources", () => {
    const o = makeNode();
    const s1 = makeNode();
    const s2 = makeNode();
    const s3 = makeNode();

    linkEdge(o, s1);
    linkEdge(o, s2);
    linkEdge(o, s3);

    unlinkAllSources(o);

    expect(o._sourceCount).toBe(0);
    expect(collectSources(o).length).toBe(0);

    expect(s1._observerCount).toBe(0);
    expect(s2._observerCount).toBe(0);
    expect(s3._observerCount).toBe(0);
  });

  it("unlinks all observers", () => {
    const s = makeNode();
    const o1 = makeNode();
    const o2 = makeNode();
    const o3 = makeNode();

    linkEdge(o1, s);
    linkEdge(o2, s);
    linkEdge(o3, s);

    unlinkAllObservers(s);

    expect(s._observerCount).toBe(0);
    expect(collectObservers(s).length).toBe(0);

    expect(o1._sourceCount).toBe(0);
    expect(o2._sourceCount).toBe(0);
    expect(o3._sourceCount).toBe(0);
  });

  it("is safe to relink after unlink", () => {
    const o = makeNode();
    const s = makeNode();

    const l = linkEdge(o, s);
    unlinkEdge(l);

    const l2 = linkEdge(o, s);

    expect(o._sourceCount).toBe(1);
    expect(s._observerCount).toBe(1);

    const sources = collectSources(o);
    const observers = collectObservers(s);

    expect(sources[0]).toBe(s);
    expect(observers[0]).toBe(o);

    expect(l).toBe(l2);
  });
});
