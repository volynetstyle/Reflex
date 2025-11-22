import { GraphNode, Link } from "./graph.node";
import { linkPool } from "./graph.pool";

export function linkEdge(observer: GraphNode, source: GraphNode): Link {
  const link = linkPool.acquire(source, observer)


  // --- привязка к source (список observers) ---
  if (source._firstObserver === null) {
    source._firstObserver = link;
    source._lastObserver = link;
    link.prevInSource = null;
    link.nextInSource = null;
  } else {
    const last = source._lastObserver!;
    last.nextInSource = link;
    link.prevInSource = last;
    link.nextInSource = null;
    source._lastObserver = link;
  }
  source._observerCount++;

  // --- привязка к observer (список sources) ---
  if (observer._firstSource === null) {
    observer._firstSource = link;
    observer._lastSource = link;
    link.prevInObserver = null;
    link.nextInObserver = null;
  } else {
    const last = observer._lastSource!;
    last.nextInObserver = link;
    link.prevInObserver = last;
    link.nextInObserver = null;
    observer._lastSource = link;
  }
  observer._sourceCount++;

  return link;
}

export function unlinkEdge(link: Link): void {
  const source = link.source;
  const observer = link.observer;

  // Если уже в пуле или "битый" — можно early-out (на всякий случай).
  if (!source || !observer) {
    return;
  }

  // --- отвязка от source.observers ---
  const prevS = link.prevInSource;
  const nextS = link.nextInSource;

  if (prevS) {
    prevS.nextInSource = nextS;
  } else {
    // link был первым
    source._firstObserver = nextS;
  }

  if (nextS) {
    nextS.prevInSource = prevS;
  } else {
    // link был последним
    source._lastObserver = prevS;
  }

  source._observerCount--;

  // --- отвязка от observer.sources ---
  const prevO = link.prevInObserver;
  const nextO = link.nextInObserver;

  if (prevO) {
    prevO.nextInObserver = nextO;
  } else {
    observer._firstSource = nextO;
  }

  if (nextO) {
    nextO.prevInObserver = prevO;
  } else {
    observer._lastSource = prevO;
  }

  observer._sourceCount--;


  linkPool.release(link)
//   link.source = null as any;
//   link.observer = null as any;

//   link.nextInObserver = null;
//   link.prevInObserver = null;
//   link.prevInSource = null;
}

export function unlinkAllSources(observer: GraphNode) {
  let link = observer._firstSource;

  while (link) {
    const next = link.nextInObserver;
    unlinkEdge(link);
    link = next;
  }

  observer._firstSource = null;
  observer._sourceCount = 0;
}

export function unlinkAllObservers(source: GraphNode) {
  let link = source._firstObserver;

  while (link) {
    const next = link.nextInSource;
    unlinkEdge(link);
    link = next;
  }

  source._firstObserver = null;
  source._observerCount = 0;
}

/**
 * Итерировать по всем наблюдателям для source.
 * (используется в пропагации реактивности)
 */
export function forEachObserver(
  source: GraphNode,
  fn: (observer: GraphNode) => void,
): void {
  let link = source._firstObserver;
  while (link) {
    const next = link.nextInSource;
    fn(link.observer);
    link = next;
  }
}

/**
 * Итерировать по всем источникам для observer.
 */
export function forEachSource(
  observer: GraphNode,
  fn: (source: GraphNode) => void,
): void {
  let link = observer._firstSource;
  while (link) {
    const next = link.nextInObserver;
    fn(link.source);
    link = next;
  }
}
