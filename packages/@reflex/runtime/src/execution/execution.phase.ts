import ReactiveNode from "../reactivity/shape/ReactiveNode";

export interface ExecutionPhase<T = ReactiveNode> {
  /**
   * Вызывается, когда узел каузально готов
   * и causal chain вырос
   *
   * @returns true  — если произошло СОБЫТИЕ
   *          false — если значения не изменились
   */
  execute(node: T): boolean;
}

export class SyncComputePhase implements ExecutionPhase {
  execute(node: ReactiveNode): boolean {
    if (!node.compute) return false;

    const prev = node.payload;
    const next = node.compute();

    if (Object.is(prev, next)) {
      return false;
    }

    node.payload = next;
    node.v++;
    return true;
  }
}
