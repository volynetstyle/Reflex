import { GraphNode, IReactiveNode } from "../graph.types";
import { arena, NULL } from "../memory/graph.arena";

function resolveId(node: GraphNode | number): number {
  return typeof node === "number" ? node : (node as any).__id;
}

export function linkSourceToObserverUnsafe(
  source: GraphNode | number,
  observer: GraphNode | number
): void {
  const sId = resolveId(source);
  const oId = resolveId(observer);

  // Добавляем source в список sources observer-а
  const lastSrc = arena.lastSource[oId]!;
  if (lastSrc === NULL) {
    arena.firstSource[oId] = sId;
  } else {
    arena.nextSource[lastSrc] = sId;
    arena.prevSource[sId] = lastSrc;
  }
  arena.lastSource[oId] = sId;
  arena.sourceCount[oId]!++;

  // Добавляем observer в список observers source-а
  const lastObs = arena.lastObserver[sId]!;
  if (lastObs === NULL) {
    arena.firstObserver[sId] = oId;
  } else {
    arena.nextObserver[lastObs] = oId;
    arena.prevObserver[oId] = lastObs;
  }
  arena.lastObserver[sId] = oId;
  arena.observerCount[sId]!++;
}

export function unlinkSourceFromObserverUnsafe(
  source: GraphNode | number,
  observer: GraphNode | number
): void {
  const sId = resolveId(source);
  const oId = resolveId(observer);

  // Удаляем source из списка sources observer-а
  const prevSrc = arena.prevSource[sId]!;
  const nextSrc = arena.nextSource[sId]!;

  if (prevSrc !== NULL) arena.nextSource[prevSrc] = nextSrc;
  else arena.firstSource[oId] = nextSrc;

  if (nextSrc !== NULL) arena.prevSource[nextSrc] = prevSrc;
  else arena.lastSource[oId] = prevSrc;

  arena.prevSource[sId] = NULL;
  arena.nextSource[sId] = NULL;
  arena.sourceCount[oId]!--;

  // Удаляем observer из списка observers source-а
  const prevObs = arena.prevObserver[oId]!;
  const nextObs = arena.nextObserver[oId]!;

  if (prevObs !== NULL) arena.nextObserver[prevObs] = nextObs;
  else arena.firstObserver[sId] = nextObs;

  if (nextObs !== NULL) arena.prevObserver[nextObs] = prevObs;
  else arena.lastObserver[sId] = prevObs;

  arena.prevObserver[oId] = NULL;
  arena.nextObserver[oId] = NULL;
  arena.observerCount[sId]!--;
}

export function unlinkAllObserversUnsafe(source: IReactiveNode): void {
  let observer = source._firstObserver;

  while (observer !== null) {
    const nextObserver = observer._nextObserver;
    unlinkSourceFromObserverUnsafe(source, observer);
    observer = nextObserver;
  }
}

export function unlinkAllSourcesUnsafe(observer: IReactiveNode): void {
  let source = observer._firstSource;

  while (source !== null) {
    const nextSource = source._nextSource;
    unlinkSourceFromObserverUnsafe(source, observer);
    source = nextSource;
  }
}
