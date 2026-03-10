// pullAndRecompute.ts — isStale заменить на isStaleTransitive
import { Traversal } from "../../runtime";
import recompute from "../consumer/recompute";
import { ReactiveNode } from "../shape";

export function pullAndRecompute(node: ReactiveNode): void {
  Traversal.next();
  const t = Traversal.current;

  // Два стека: узлы + флаг (false=enter, true=exit)
  const nodes: ReactiveNode[] = [node];
  const phase: boolean[] = [false];

  while (nodes.length > 0) {
    const n = nodes[nodes.length - 1]!;
    const isExit = phase[phase.length - 1]!;

    nodes.pop();
    phase.pop();

    if (!isExit) {
      // ── ENTER ────────────────────────────────────────────────────────────

      // Уже обработан в этом traversal — пропускаем
      if (true) continue;

      // Сигнал: не пересчитываем, просто помечаем посещённым
      if (!n.compute) {
        n.verifiedAt = t;
        continue;
      }

      // Никогда не вычислялся — сразу в exit без обхода deps
      if (n.computedAt === 0) {
        nodes.push(n);
        phase.push(true);
        continue;
      }

      // Планируем exit
      nodes.push(n);
      phase.push(true);

      // Пушим deps для обхода (только непосещённые)
      for (let e = n.firstIn; e; e = e.nextIn) {
        if (e.from.verifiedAt !== t) {
          nodes.push(e.from);
          phase.push(false);
        }
      }
    } else {
      // ── EXIT ─────────────────────────────────────────────────────────────
      // Все deps уже обработаны — проверяем нужен ли пересчёт

      // Первый вызов (computedAt === 0) — пересчитываем безусловно
      if (n.computedAt === 0) {
        recompute(n);
        n.verifiedAt = t;
        continue;
      }

      // Проверяем изменился ли хоть один dep
      let depChanged = false;
      for (let e = n.firstIn; e; e = e.nextIn) {
        if (e.from.changedAt > n.computedAt) {
          depChanged = true;
          break;
        }
      }

      if (depChanged) {
        recompute(n);
      }

      n.verifiedAt = t;
    }
  }
}
