import runtime from "../../runtime";
import recompute from "../consumer/recompute";
import { INVALID, ReactiveNode, ReactiveNodeState } from "../shape";
import { clearPropagate } from "./clearPropagate";
import { propagate } from "./propagate";

export function pullAndRecompute(node: ReactiveNode): void {
  runtime.pullPush(node);

  while (runtime.pulling) {
    const n = runtime.pullPeek();
    let s = n.runtime;

    // ───────────────── EXIT PHASE ─────────────────
    if (s & ReactiveNodeState.OnStack) {
      runtime.pullPop();

      n.runtime = s &= ~(ReactiveNodeState.OnStack | ReactiveNodeState.Visited);

      // Делает слишком много работы.
      // Во первых, примитивен тот факт, что изменение сигнала требует обхода
      // С начала до конца всех нод разве что если они уже не ИНВАЛИДНЫ, флаг такой есть
      // Во вторых, это по сути чек, мы не можем быть убеждены, что где-то не
      // не надо будет пересчитать, поэтому, после того, как мы дошли от ноды
      // А .... В выявилось, что даунстрим пересчитывать не надо, но он невалидный, надо чистить
      // (V+E) по глубине что изменилось + (V+E) что осталось, c таким же успехом, можно
      // на push все пересчитывать
      if (n.compute && s & INVALID) {
        if (recompute(n)) {
          propagate(n);
        } else {
          let clean = true;

          for (let e = n.firstIn; e; e = e.nextIn) {
            if (e.from.runtime & INVALID) {
              clean = false;
              break;
            }
          }

          if (clean) clearPropagate(n);
        }
      }

      continue;
    }

    // ───────────────── ENTER PHASE ─────────────────

    // уже посещали
    if (s & ReactiveNodeState.Visited) {
      runtime.pullPop();
      continue;
    }

    // mark visited
    n.runtime = s |= ReactiveNodeState.Visited;

    // hot path: node already clean
    if (!(s & INVALID)) {
      runtime.pullPop();
      n.runtime = s & ~ReactiveNodeState.Visited;
      continue;
    }

    // mark for exit
    n.runtime = s |= ReactiveNodeState.OnStack;

    // obsolete → deps не нужны
    if (s & ReactiveNodeState.Obsolete) continue;

    // traverse deps
    for (let e = n.firstIn; e; e = e.nextIn) {
      const p = e.from;

      if (!(p.runtime & ReactiveNodeState.Visited)) {
        runtime.pullPush(p);
      }
    }
  }
}
