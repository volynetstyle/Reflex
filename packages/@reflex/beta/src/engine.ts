import { ReactiveNode, EngineContext } from "./core.js";
//import { OrderList } from "./order.js";
import { markInvalid } from "./walkers.js";

// export function run(ctx: EngineContext, list: OrderList): number {
//   let node = ctx.firstDirty;
//   let count = 0;
//   while (node) {
//     if (node.isDirty) {
//       if (needsUpdate(node)) {
//         const changed = recompute(ctx, node, list);
//         count++;
//         if (changed) {
//           for (let e = node.firstOut; e; e = e.nextOut) {
//             if (!(e.to.state & ReactiveNodeState.Invalid))
//               e.to.state |= ReactiveNodeState.Invalid;
//           }
//         }
//       } else node.state &= CLEANUP_STATE;
//     }
//     node = node.next;
//   }
//   ctx.firstDirty = null;
//   return count;
// }

export function writeSignal(
  ctx: EngineContext,
  node: ReactiveNode,
  value: unknown,
): void {
  applySignalWrite(ctx, node, value, ctx.bumpEpoch());
}

export function batchWrite(
  ctx: EngineContext,
  writes: Array<[ReactiveNode, unknown]>,
): void {
  const epoch = ctx.bumpEpoch();

  for (const [node, value] of writes) {
    applySignalWrite(ctx, node, value, epoch);
  }
}

function applySignalWrite(
  ctx: EngineContext,
  node: ReactiveNode,
  value: unknown,
  epoch: number,
): void {
  if (Object.is(node.payload, value)) return;

  node.payload = value;
  node.t = epoch;

  for (let e = node.firstOut; e; e = e.nextOut) {
    markInvalid(ctx, e.to);
  }
}
