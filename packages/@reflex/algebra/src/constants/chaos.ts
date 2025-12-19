import { CausalCoords, WRAP_END } from "./coords";

type NodePoint = {
  point: CausalCoords;
};

type PotentialApprovalEvent = {
  id: number;
  value: unknown;
  target: unknown & NodePoint;
  point: CausalCoords;
};

/**
 * Точка в дискретному просторі T⁴
 */
export class CausalPoint {
  constructor(
    public readonly t: number, // Epoch
    public readonly v: number, // Version
    public readonly p: number, // Generation (async)
    public readonly s: number, // Structure
  ) {
    this.t = 0;
    this.v = 0;
    this.p = 0;
    this.s = 0;
  }

  /**
   * Порівняння в циклічній групі (S¹)
   * Повертає "відстань" з урахуванням переповнення (wrap-around)
   */
  static delta(a: number, b: number, bits: number): number {
    const size = 1 << bits;
    const diff = (b - a) & (size - 1);
    // Якщо diff > size/2, то 'a' фактично після 'b' у циклі
    return diff > size >> 1 ? diff - size : diff;
  }

  /**
   * Перевірка: чи знаходиться точка B у майбутньому відносно A
   */
  isBefore(other: CausalPoint): boolean {
    // В Level 0 ми зазвичай перевіряємо t (час) та s (структуру)
    const dt = CausalPoint.delta(this.t, other.t, WRAP_END);
    const ds = CausalPoint.delta(this.s, other.s, WRAP_END);

    // Структурна епоха має бути ідентичною (або строго наступною)
    if (ds !== 0) return false;

    return dt > 0;
  }
}

export class CausalApprover<V> {
  constructor(
    private readonly currentEpoch: number,
    private readonly level: 0 | 1 | 2 | 3 = 0,
  ) {}

  /**
   * Головна функція узгодження
   */
  approve(updates: PotentialApprovalEvent[]): {
    approved: boolean;
    error?: string;
  } {
    // Валідація за рівнями (Projection logic)
    for (const update of updates) {
      // Level 2 & 1 check: Structure & Epoch consistency
      if (this.level <= 2) {
        if (update.point.s !== this.currentEpoch) {
          return {
            approved: false,
            error: `Structure mismatch: expected ${this.currentEpoch}`,
          };
        }
      }

      // Перевірка зв'язків (Sheaf gluing condition simplified)
      const obstruction = this.checkLocalConsistency(update, updates);
      if (obstruction) return { approved: false, error: obstruction };
    }

    return { approved: true };
  }

  private checkLocalConsistency(
    current: PotentialApprovalEvent,
    all: PotentialApprovalEvent[],
  ): string | null {
    const { target, point, value } = current;

    // Перевіряємо лише вхідні ребра (батьків)
    let edge = target.firstIn;
    while (edge) {
      const parentNode = edge.from;
      const parentUpdate = all.find((u) => u.target === parentNode);

      if (parentUpdate) {
        // 1. Causal order check (t-axis)
        if (this.level <= 1) {
          const dt = CausalPoint.delta(parentUpdate.point.t, point.t, 16);
          if (dt <= 0)
            return `Causal violation between ${parentUpdate.id} and ${current.id}`;
        }

        // 2. Value compatibility (v-axis)
        // Тут ми просто викликаємо предикат, що заданий на ребрі або в графі
        if (!this.isCompatible(parentUpdate.value, value, edge)) {
          return `Value restriction violated on edge ${parentNode.id} -> ${target.id}`;
        }
      }
      edge = edge.nextIn;
    }

    return null;
  }

  private isCompatible(parentVal: V, childVal: V, edge: any): boolean {
    // Якщо вузол має функцію обчислення, перевіряємо чи childVal == f(parentVal)
    if (edge.constraint) {
      return edge.constraint(parentVal, childVal);
    }
    return true; // За замовчуванням вважаємо сумісними
  }
}
export type { PotentialApprovalEvent };
