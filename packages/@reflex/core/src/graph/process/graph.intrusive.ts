/**
 * @file graph.intrusive.ts
 *
 * Low-level helpers for intrusive doubly-linked adjacency lists.
 * Works directly with GraphNode/GraphEdge fields (first/last/prev/next).
 *
 * Эти функции UNSAFE:
 *  - не проверяют инварианты DAG (циклы, дубликаты)
 *  - не проверяют, что edge ещё не привязан
 *  - не проверяют, что from/to совпадают с source/observer
 *
 * Их задача — быть максимально быстрыми building-block’ами для
 * более высокоуровневого API графа.
 */

import { GraphEdge, GraphNode } from "../graph.node";

// ═══════════════════════════════════════════════════════════════════
// BASICS: Edge-level link/unlink (building blocks)
// ═══════════════════════════════════════════════════════════════════

/**
 * linkSourceToObserverUnsafe: базовый building-block.
 *
 * Создаёт новый GraphEdge и вставляет его:
 *  - в OUT-список source (firstOut/lastOut)
 *  - в IN-список observer (firstIn/lastIn)
 *
 * Сложность: O(1).
 * Никаких аллокаций, кроме самого GraphEdge.
 *
 * Препосылки (НЕ проверяются):
 *  - source !== observer
 *  - edge между ними ещё не существует
 *  - нет циклов (DAG-инвариант обеспечивает вызывающий код)
 */
export function linkSourceToObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): GraphEdge {
  const e = new GraphEdge(source, observer);

  // ── OUT adjacency (source -> ...)
  const lastOut = source.lastOut;
  e.prevOut = lastOut;
  e.nextOut = null;

  if (lastOut === null) {
    source.firstOut = e;
  } else {
    lastOut.nextOut = e;
  }
  source.lastOut = e;
  source.outCount++;

  // ── IN adjacency (... -> observer)
  const lastIn = observer.lastIn;
  e.prevIn = lastIn;
  e.nextIn = null;

  if (lastIn === null) {
    observer.firstIn = e;
  } else {
    lastIn.nextIn = e;
  }
  observer.lastIn = e;
  observer.inCount++;

  return e;
}

/**
 * unlinkEdgeUnsafe: базовый building-block для разрыва связи.
 *
 * Выпиливает edge из:
 *  - OUT-списка from
 *  - IN-списка to
 *
 * Сложность: O(1).
 *
 * Препосылки (НЕ проверяются):
 *  - edge.from / edge.to находятся в корректных списках
 *  - списки связаны консистентно (prev/next корректны)
 */
export function unlinkEdgeUnsafe(edge: GraphEdge): void {
  const from = edge.from;
  const to = edge.to;

  // ── OUT list unlink (from.firstOut/lastOut)
  const prevOut = edge.prevOut;
  const nextOut = edge.nextOut;

  if (prevOut === null) {
    from.firstOut = nextOut;
  } else {
    prevOut.nextOut = nextOut;
  }

  if (nextOut === null) {
    from.lastOut = prevOut;
  } else {
    nextOut.prevOut = prevOut;
  }

  from.outCount--;

  // ── IN list unlink (to.firstIn/lastIn)
  const prevIn = edge.prevIn;
  const nextIn = edge.nextIn;

  if (prevIn === null) {
    to.firstIn = nextIn;
  } else {
    prevIn.nextIn = nextIn;
  }

  if (nextIn === null) {
    to.lastIn = prevIn;
  } else {
    nextIn.prevIn = prevIn;
  }

  to.inCount--;

  // Обнуляем ссылки, чтобы edge можно было реиспользовать/GC
  edge.prevOut = edge.nextOut = null;
  edge.prevIn = edge.nextIn = null;
  // from/to оставляем — они могут быть полезны для отладки/логики
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS (source/observer level)
// ═══════════════════════════════════════════════════════════════════

/**
 * unlinkSourceFromObserverUnsafe (удобный вариант):
 *
 * Находит edge(source -> observer) в OUT-списке source
 * и удаляет его через unlinkEdgeUnsafe.
 *
 * Сложность: O(degree(source)).
 * Используй в случаях, когда:
 *  - степень узла умеренная
 *  - нет заранее сохранённой ссылки на edge
 */
export function unlinkSourceFromObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): void {
  let edge = source.firstOut;

  while (edge !== null) {
    if (edge.to === observer) {
      unlinkEdgeUnsafe(edge);
      return;
    }
    edge = edge.nextOut;
  }

  // Если сюда дошли — связи не было. В UNSAFE-варианте молча игнорируем.
}

// ═══════════════════════════════════════════════════════════════════
// BULK / BATCH OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * linkSourceToObserversBatchUnsafe:
 *
 * Batch-link: один source → N observers.
 * Делает линковку через базовый building-block linkSourceToObserverUnsafe.
 *
 * Сложность: O(N), без дополнительных аллокаций, кроме массива edges.
 * Возвращает массив созданных Edge (если нужно кэшировать их для быстрого unlink).
 */
export function linkSourceToObserversBatchUnsafe(
  source: GraphNode,
  observers: readonly GraphNode[],
): GraphEdge[] {
  const n = observers.length;
  if (n === 0) return [];

  const edges = new Array<GraphEdge>(n);

  for (let i = 0; i < n; i++) {
    const observer = observers[i]!;
    edges[i] = linkSourceToObserverUnsafe(source, observer);
  }

  return edges;
}

/**
 * unlinkAllObserversUnsafe:
 *
 * Полный разрыв всех исходящих связей (OUT) у source.
 * Линейный проход по списку firstOut → ... → lastOut.
 *
 * Сложность: O(degree(source)).
 */
export function unlinkAllObserversUnsafe(source: GraphNode): void {
  let edge = source.firstOut;

  while (edge !== null) {
    const next = edge.nextOut;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }

  // На выходе:
  //  - source.firstOut === null
  //  - source.lastOut === null
  //  - source.outCount === 0
}

/**
 * unlinkAllSourcesUnsafe:
 *
 * Полный разрыв всех входящих связей (IN) у observer.
 * Линейный проход по списку firstIn → ... → lastIn.
 *
 * Сложность: O(degree_in(observer)).
 */
export function unlinkAllSourcesUnsafe(observer: GraphNode): void {
  let edge = observer.firstIn;

  while (edge !== null) {
    const next = edge.nextIn;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }

  // На выходе:
  //  - observer.firstIn === null
  //  - observer.lastIn === null
  //  - observer.inCount === 0
}

// ═══════════════════════════════════════════════════════════════════
// SLOW-PATH: CHUNKED UNLINK (для очень больших степеней)
// ═══════════════════════════════════════════════════════════════════

/**
 * unlinkAllObserversChunkedUnsafe:
 *
 * Slow-path fallback для узлов с очень большой out-степенью.
 * Делает два прохода:
 *  1) собирает edges в массив (линейный скан OUT-списка)
 *  2) идёт по массиву в обратном порядке и делает unlinkEdgeUnsafe
 *
 * Смысл:
 *  - улучшить locality, избегая повторного чтения модифицируемых указателей
 *  - упростить паттерн ветвления для JIT
 */
export function unlinkAllObserversChunkedUnsafe(source: GraphNode): void {
  const count = source.outCount;
  if (count === 0) return;

  if (count === 1) {
    // Быстрый путь — один edge
    const e = source.firstOut!;
    unlinkEdgeUnsafe(e);
    return;
  }

  const edges: GraphEdge[] = new Array(count);
  let idx = 0;
  let edge = source.firstOut;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = edge.nextOut;
  }

  // Идём в обратном порядке (чтобы не зависеть от того, как unlink мутирует списки)
  for (let i = count - 1; i >= 0; i--) {
    unlinkEdgeUnsafe(edges[i]!);
  }
}

/**
 * unlinkAllSourcesChunkedUnsafe:
 *
 * Аналогично unlinkAllObserversChunkedUnsafe, но для IN-списка.
 */
export function unlinkAllSourcesChunkedUnsafe(observer: GraphNode): void {
  const count = observer.inCount;
  if (count === 0) return;

  if (count === 1) {
    const e = observer.firstIn!;
    unlinkEdgeUnsafe(e);
    return;
  }

  const edges: GraphEdge[] = new Array(count);
  let idx = 0;
  let edge = observer.firstIn;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = edge.nextIn;
  }

  for (let i = count - 1; i >= 0; i--) {
    unlinkEdgeUnsafe(edges[i]!);
  }
}

// ═══════════════════════════════════════════════════════════════════
// BULK UNLINK ДЛЯ DISPOSE (СПРЯТАНО ПОД graph.dispose)
// ═══════════════════════════════════════════════════════════════════

/**
 * Внимание: эта функция НЕ экспортируется.
 * Её задача — быть быстрым "ядерным" вариантом для полного dispose
 * всего графа или подграфа, когда нам уже не важно состояние соседей.
 *
 * Предполагается, что:
 *  - вызывается только из graph.dispose(GraphNode) / teardown logic
 *  - после вызова все затронутые ноды больше не используются
 *
 * Внутри все unlink делаем через unlinkEdgeUnsafe, чтобы не ломать
 * инварианты IN-списков у соседей. При желании можно сделать ещё более
 * агрессивный variant, который не трогает соседей вообще — но тогда
 * его можно вызывать только при dispose ВЕСЬ граф.
 */
function unlinkAllObserversBulkUnsafeForDisposal(source: GraphNode): void {
  // Сейчас это просто alias на chunked-стратегию.
  // Если понадобится — сюда можно положить ещё более агрессивную реализацию.
  unlinkAllObserversChunkedUnsafe(source);
}

// Если понадобится использовать в graph.dispose — импортируй из этого файла
// либо реэкспортом, либо перенеси логику в модуль графа.

// ═══════════════════════════════════════════════════════════════════
// Доп. утилиты hasSource/hasObserver c учётом Edge-модели
// ═══════════════════════════════════════════════════════════════════

export function hasSourceUnsafe(
  source: GraphNode,
  observer: GraphNode,
): boolean {
  // ищем edge(source -> observer) в OUT-списке
  let edge = source.firstOut;
  while (edge !== null) {
    if (edge.to === observer) return true;
    edge = edge.nextOut;
  }
  return false;
}

export function hasObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): boolean {
  // симметрично — ищем edge(source -> observer) в IN-списке observer
  let edge = observer.firstIn;
  while (edge !== null) {
    if (edge.from === source) return true;
    edge = edge.nextIn;
  }
  return false;
}

/**
 * replaceSourceUnsafe:
 *
 * Семантика та же:
 *   unlinkSourceFromObserverUnsafe(oldSource, observer)
 *   linkSourceToObserverUnsafe(newSource, observer)
 *
 * Реализация: O(degree(oldSource)) на поиск edge.
 * Если в горячем пути нужна O(1), то нужно держать ссылку на edge.
 */
export function replaceSourceUnsafe(
  oldSource: GraphNode,
  newSource: GraphNode,
  observer: GraphNode,
): void {
  // 1) unlink oldSource -> observer (если есть)
  unlinkSourceFromObserverUnsafe(oldSource, observer);

  // 2) link newSource -> observer
  linkSourceToObserverUnsafe(newSource, observer);
}
