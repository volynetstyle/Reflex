import { describe, it, expect } from "vitest";
import {
  IReactiveNode,
  ISourceLink,
  IObserverLink,
  ReactiveNodeKind,
} from "../../src/core/graph/graph.types";
import {
  linkEdge,
  unlinkSourceLink,
  unlinkObserverLink,
} from "../../src/core/graph/utils/graph_linker";

function makeNode(kind: ReactiveNodeKind = "computation"): IReactiveNode {
  return {
    _valueRaw: null,
    _sources: null,
    _observers: null,
    _observer: null,
    _counters: new Uint32Array(3),
    _async: new Uint32Array(2),
    _flags: 0,
    _kind: kind,
  };
}

const collectSourceChain = (head: ISourceLink | null): ISourceLink[] => {
  const result: ISourceLink[] = [];
  let cur = head;
  while (cur) {
    result.push(cur);
    cur = cur._next;
  }
  return result;
};

const collectObserverChain = (head: IObserverLink | null): IObserverLink[] => {
  const result: IObserverLink[] = [];
  let cur = head;
  while (cur) {
    result.push(cur);
    cur = cur._next;
  }
  return result;
};

describe("graph_linker: linkEdge / unlinkSourceLink / unlinkObserverLink", () => {
  it("создаёт симметричное ребро между observer и source", () => {
    const observer = makeNode("computation");
    const source = makeNode("source");

    const { _source, obs } = linkEdge(observer, source);

    // связи в observer
    expect(observer._sources).toBe(_source);
    expect(_source._prev).toBeNull();
    expect(_source._next).toBeNull();
    expect(_source.source).toBe(source);
    expect(_source._pair).toBe(obs);

    // связи в source
    expect(source._observers).toBe(obs);
    expect(obs._prev).toBeNull();
    expect(obs._next).toBeNull();
    expect(obs.observer).toBe(observer);
    expect(obs._pair).toBe(_source);
  });

  it("поддерживает несколько разных источников у одного observer (список sources)", () => {
    const observer = makeNode();
    const s1 = makeNode("source");
    const s2 = makeNode("source");
    const s3 = makeNode("source"); 

    const { _source: l1 } = linkEdge(observer, s1);
    const { _source: l2 } = linkEdge(observer, s2);
    const { _source: l3 } = linkEdge(observer, s3);

    const chain = collectSourceChain(observer._sources)!;

    // порядок: последний вставленный в голове
    expect(chain[0]).toBe(l3);
    expect(chain[1]).toBe(l2);
    expect(chain[2]).toBe(l1);

    // prev/next согласованно
    expect(chain[0]!._prev).toBeNull();
    expect(chain[0]!._next).toBe(chain[1]);
    expect(chain[1]!._prev).toBe(chain[0]);
    expect(chain[1]!._next).toBe(chain[2]);
    expect(chain[2]!._prev).toBe(chain[1]);
    expect(chain[2]!._next).toBeNull();
  });

  it("поддерживает нескольких observers для одного source (список observers)", () => {
    const source = makeNode("source");
    const o1 = makeNode("computation");
    const o2 = makeNode("computation");
    const o3 = makeNode("computation");

    const { obs: l1 } = linkEdge(o1, source);
    const { obs: l2 } = linkEdge(o2, source);
    const { obs: l3 } = linkEdge(o3, source);

    const chain = collectObserverChain(source._observers)!;

    expect(chain[0]).toBe(l3);
    expect(chain[1]).toBe(l2);
    expect(chain[2]).toBe(l1);

    expect(chain[0]!._prev).toBeNull();
    expect(chain[0]!._next).toBe(chain[1]);
    expect(chain[1]!._prev).toBe(chain[0]);
    expect(chain[1]!._next).toBe(chain[2]);
    expect(chain[2]!._prev).toBe(chain[1]);
    expect(chain[2]!._next).toBeNull();
  });

  it("unlinkSourceLink корректно удаляет ребро из обоих списков (single edge)", () => {
    const observer = makeNode();
    const source = makeNode("source");

    const { _source, obs } = linkEdge(observer, source);

    unlinkSourceLink(_source);

    expect(observer._sources).toBeNull();
    expect(source._observers).toBeNull();

    // ссылки очищены
    expect(_source._prev).toBeNull();
    expect(_source._next).toBeNull();
    expect(obs._prev).toBeNull();
    expect(obs._next).toBeNull();

    // пары обнулены
    expect(_source._pair).toBeNull();
    expect(obs._pair).toBeNull();
  });

  it("unlinkObserverLink корректно удаляет ребро из обоих списков", () => {
    const observer = makeNode();
    const source = makeNode("source");

    const { _source, obs } = linkEdge(observer, source);

    unlinkObserverLink(obs);

    expect(observer._sources).toBeNull();
    expect(source._observers).toBeNull();
    expect(_source._pair).toBeNull();
    expect(obs._pair).toBeNull();
  });

  it("unlinkSourceLink корректно удаляет середину списка", () => {
    const observer = makeNode();
    const s1 = makeNode("source");
    const s2 = makeNode("source");
    const s3 = makeNode("source");

    const { _source: l1 } = linkEdge(observer, s1);
    const { _source: l2 } = linkEdge(observer, s2);
    const { _source: l3 } = linkEdge(observer, s3);

    // цепочка: l3 -> l2 -> l1
    unlinkSourceLink(l2);

    const chain = collectSourceChain(observer._sources);
    expect(chain.length).toBe(2);
    expect(chain[0]).toBe(l3);
    expect(chain[1]).toBe(l1);

    expect(chain[0]!._next).toBe(chain[1]);
    expect(chain[1]!._prev).toBe(chain[0]);
  });

  it("повторный unlinkSourceLink не падает и не ломает другие связи (idempotent)", () => {
    const observer = makeNode();
    const source = makeNode("source");

    const { _source } = linkEdge(observer, source);

    unlinkSourceLink(_source);
    // второй вызов ничего не должен ломать
    unlinkSourceLink(_source);

    expect(observer._sources).toBeNull();
    expect(source._observers).toBeNull();
  });
});
