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

      // Робить дохуя багато роботи.
      // По-перше, примітивний той факт, що зміна сигналу потребує обходу
      // З початку до кінця всіх нод хіба що якщо вони вже не інвалідні, прапор такий є
      // По-друге, це по суті чек, ми не можемо бути переконані, що десь не
      // не треба буде перерахувати, тому після того, як ми дійшли від ноди
      // А .... до .... Д .... даунстім -  виявилося, що даунстрім перераховувати не треба, але він невалідний, треба чистити
      // (V+E) по глибині що змінилося + (V+E) що залишилося, з таким самим успіхом, можна
      // на push все перераховувати
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
