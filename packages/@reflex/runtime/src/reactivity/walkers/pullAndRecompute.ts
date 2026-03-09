// pullAndRecompute.ts — isStale заменить на isStaleTransitive
import { Traversal } from "../../runtime";
import recompute from "../consumer/recompute";
import { ReactiveNode } from "../shape";
import { isObsolete, isStaleTransitive, isVisited, markVisited } from "../shape/ReactiveVersion";

export function pullAndRecompute(node: ReactiveNode): void {
  Traversal.next();

  const stack: ReactiveNode[] = [node];
  const exitStack: boolean[] = [false];
  const toRecompute: ReactiveNode[] = [];

  while (stack.length) {
    const n = stack.pop()!;
    const isExit = exitStack.pop()!;

    if (!isExit) {
      if (isVisited(n)) continue;
      markVisited(n);

      if (!isStaleTransitive(n)) continue; // ← транзитивная проверка

      stack.push(n);
      exitStack.push(true);

      if (!isObsolete(n)) {
        for (let e = n.firstIn; e; e = e.nextIn) {
          if (!isVisited(e.from)) {
            stack.push(e.from);
            exitStack.push(false);
          }
        }
      }
    } else {
      if (n.compute && isStaleTransitive(n)) {
        toRecompute.push(n);
      }
    }
  }

  for (let i = toRecompute.length - 1; i >= 0; i--) {
    const n = toRecompute[i]!;
    if (!isStaleTransitive(n)) continue;

    recompute(n)
  }
}