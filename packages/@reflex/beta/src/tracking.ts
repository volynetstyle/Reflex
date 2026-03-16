import { EngineContext, ReactiveNode, ReactiveNodeState } from "./core";
import { connect, unlinkEdge } from "./graph";

export function trackRead(
  ctx: EngineContext,
  source: ReactiveNode,
  //list: OrderList,
): void {
  const consumer = ctx.activeComputed!;

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      // Ребро вже є — видаляємо з prevEdges якщо там є (при !stable)
      if (!(consumer.state & ReactiveNodeState.Tracking))
        consumer.prevEdges!.delete(e);
      return;
    }
  }

  // Нове ребро знайдено під час compute.
  if (consumer.state & ReactiveNodeState.Tracking) {
    // Були у stable режимі — beginTracking не викликався.
    // Retroactive fill: заповнити prevEdges всіма ПОТОЧНИМИ ребрами
    // (до додавання нового). Нове ребро туди не потрапить → finishTracking
    // видалить тільки ребра що не були прочитані у цьому compute.
    consumer.prevEdges?.clear();
    for (let e = consumer.firstIn; e; e = e.nextIn) consumer.prevEdges!.add(e);
    consumer.state &= ~ReactiveNodeState.Tracking;
  }

  // Підключити нову залежність
  connect(source, consumer);
  // Нове ребро НЕ потрапляє в prevEdges → finishTracking не видалить його
}

export function beginTracking(consumer: ReactiveNode): void {
  consumer.prevEdges = new Set();
  for (let e = consumer.firstIn; e; e = e.nextIn) consumer.prevEdges.add(e);
}

export function finishTracking(consumer: ReactiveNode): void {
  if (consumer.prevEdges!.size === 0) {
    // Жодне ребро не стало stale → граф стабільний наступного разу
    consumer.state |= ReactiveNodeState.Tracking;
  } else {
    for (const stale of consumer.prevEdges!) unlinkEdge(stale);
    consumer.prevEdges!.clear();
    // stable залишається false: граф щойно змінився, наступний recompute теж з tracking
  }
}
