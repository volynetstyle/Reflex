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
  const lastSrc = arena.getLastSource(oId);
  if (lastSrc === NULL) {
    arena.setFirstSource(oId, sId);
  } else {
    arena.setNextSource(lastSrc, sId);
    arena.setPrevSource(sId, lastSrc);
  }
  arena.setLastSource(oId, sId);
  arena.setSourceCount(oId, arena.getSourceCount(oId) + 1);

  // Добавляем observer в список observers source-а
  const lastObs = arena.getLastObserver(sId);
  if (lastObs === NULL) {
    arena.setFirstObserver(sId, oId);
  } else {
    arena.setNextObserver(lastObs, oId);
    arena.setPrevObserver(oId, lastObs);
  }
  arena.setLastObserver(sId, oId);
  arena.setObserverCount(sId, arena.getObserverCount(sId) + 1);
}

export function unlinkSourceFromObserverUnsafe(
  source: GraphNode | number,
  observer: GraphNode | number
): void {
  const sId = resolveId(source);
  const oId = resolveId(observer);

  // Удаляем source из списка sources observer-а
  const prevSrc = arena.getPrevSource(sId);
  const nextSrc = arena.getNextSource(sId);

  if (prevSrc !== NULL) arena.setNextSource(prevSrc, nextSrc);
  else arena.setFirstSource(oId, nextSrc);

  if (nextSrc !== NULL) arena.setPrevSource(nextSrc, prevSrc);
  else arena.setLastSource(oId, prevSrc);

  arena.setPrevSource(sId, NULL);
  arena.setNextSource(sId, NULL);
  arena.setSourceCount(oId, arena.getSourceCount(oId) - 1);

  // Удаляем observer из списка observers source-а
  const prevObs = arena.getPrevObserver(oId);
  const nextObs = arena.getNextObserver(oId);

  if (prevObs !== NULL) arena.setNextObserver(prevObs, nextObs);
  else arena.setFirstObserver(sId, nextObs);

  if (nextObs !== NULL) arena.setPrevObserver(nextObs, prevObs);
  else arena.setLastObserver(sId, prevObs);

  arena.setPrevObserver(oId, NULL);
  arena.setNextObserver(oId, NULL);
  arena.setObserverCount(sId, arena.getObserverCount(sId) - 1);
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
