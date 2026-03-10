import { validateNode, validateRank } from "./devkit/validate";
import {
  GROUP_SIZE,
  MAX_RANKS,
  INVALID_RANK,
  GROUP_SHIFT,
  GROUP_MASK,
} from "./bucket.constants";

export interface RankNode<T> {
  nextPeer: RankNode<T> | null;
  prevPeer: RankNode<T> | null;
  rank: number;
}

/**
 * RankedQueue — интралюзивная черга с O(1) insert, remove и popMin
 *
 * Использует двухуровневую bitmap для быстрого поиска минимума.
 * Все узлы одного ранга организованы в двусвязный список.
 *
 * Гарантии:
 * - O(1) вставка, удаление, popMin
 * - O(1) доступ к памяти с хорошей локальностью
 * - Zero allocation при операциях
 * - Safe: полная валидация rank, NaN checking, double-insert protection
 *
 * =============================================================================
 * RankedQueue — Intrusive O(1) Priority Scheduler
 * =============================================================================
 *
 * Архитектура:
 * - 2-уровневая bitmap (TopMask + LeafMasks)
 * - Buckets по каждому rank (двусвязные списки)
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Пример: простой DAG с рангами
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *        A     (rank 0)
 *       / \
 *      /   \
 *     B     C  (1)
 *      \   /
 *       \ /
 *        D     (2)
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Bitmap структура
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GROUP_SHIFT = 5 → 32 ранга на группу
 * MAX_RANKS   = 1024 → 32 группы × 32 ранга
 *
 *
 * Допустим используются ранги: 0, 1, 2
 * Все они попадают в GROUP 0
 *
 *
 * LeafMasks[0]  (биты 0..7 показаны для наглядности)
 *
 *   Bit index:   7 6 5 4 3 2 1 0
 *   --------------------------------
 *   Bit value:   0 0 0 0 0 1 1 1
 *                          ↑ ↑ ↑
 *                        r2 r1 r0
 *
 * → Биты 0,1,2 установлены
 *
 *
 * Все узлы находятся в группе 0 →
 *
 * TopMask (32 группы):
 *
 *   Group bit:  ... 3 2 1 0
 *   -------------------------
 *   Bit value:  ... 0 0 0 1
 *                             ↑
 *                           group 0 активна r0
 *
 *
 * Итог:
 *
 *   TopMask      = 000...0001
 *   LeafMasks[0] = 0000 0111
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Buckets (intrusive linked lists)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Каждый rank имеет свой bucket:
 *
 *   buckets[0]: A
 *   buckets[1]: C ⇄ B
 *   buckets[2]: D
 *
 * Визуализация структуры памяти:
 *
 *   ┌──────────────────────────────┐
 *   │ TopMask                      │
 *   │ 0000 ... 0001                │
 *   └──────────────┬───────────────┘
 *                  │
 *          ┌───────▼────────┐
 *          │ LeafMasks[0]   │
 *          │ 0000 0111      │
 *          └───────┬────────┘
 *                  │
 *      ┌───────────┼───────────┬───────────┐
 *      ▼           ▼           ▼
 *   buckets[0]  buckets[1]  buckets[2]
 *      │           │           │
 *      A        C ⇄ B          D
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * popMin() как это работает
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Берём LSB(topMask)
 *      → group 0
 *
 * 2. Берём LSB(leafMasks[0])
 *      → rank 0
 *
 * 3. buckets[0]
 *      → возвращаем A
 *
 * Всё без сканирования.
 * Всё за O(1).
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Инварианты
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ✓ Если leafMasks[g] == 0 → соответствующий бит в TopMask сброшен
 * ✓ Если bucket[rank] пуст → соответствующий бит в leafMasks очищен
 * ✓ Узел присутствует только в одном bucket
 * ✓ insert/remove/popMin не делают аллокаций
 *
 * Очень важное уточнение, в продакшен среде RankedQueue не гарантирует отсуствие
 * =============================================================================
 */
class RankedQueue<Node extends RankNode<unknown>> {
  private topMask = 0;
  private leafMasks = new Uint32Array(GROUP_SIZE);
  private buckets = new Array<Node | null>(MAX_RANKS);

  constructor() {
    for (let i = 0; i < MAX_RANKS; ++i) {
      this.buckets[i] = null;
    }
  }

  /**
   * Вставка узла в очередь
   * @param node - узел с валидным rank
   * @returns true если успешно, false если ошибка (node invalid, double-insert и т.д.)
   */
  insert(node: Node, rank: number): boolean {
    if (__DEV__) {
      if (!validateNode(node)) return false;
      if (!validateRank(rank)) return false;
    } // __DEV__

    if (node.rank !== INVALID_RANK) return false;

    node.rank = rank;

    const group = rank >>> GROUP_SHIFT;
    const index = rank & GROUP_MASK;

    const head = this.buckets[rank]!;

    if (head === null) {
      node.nextPeer = node;
      node.prevPeer = node;
    } else {
      const tail = head.prevPeer!;

      node.nextPeer = head;
      node.prevPeer = tail;

      tail.nextPeer = node;
      head.prevPeer = node;
    }

    this.buckets[rank] = node;

    this.leafMasks[group]! |= 1 << index;
    this.topMask |= 1 << group;

    return true;
  }

  remove(node: Node): boolean {
    if (__DEV__) {
      if (!validateNode(node)) return false;
    } // __DEV__

    if (node.rank === INVALID_RANK) return false;

    const rank = node.rank;
    const group = rank >>> GROUP_SHIFT;
    const index = rank & GROUP_MASK;

    const head = this.buckets[rank];
    const next = node.nextPeer!;
    const prev = node.prevPeer!;

    const wasSingle = next === node;

    if (!wasSingle) {
      prev.nextPeer = next;
      next.prevPeer = prev;

      if (head === node) {
        this.buckets[rank] = <Node>next;
      }
    } else {
      this.buckets[rank] = null;
      (<number>this.leafMasks[group]) &= ~(1 << index);

      if (this.leafMasks[group] === 0) {
        this.topMask &= ~(1 << group);
      }
    }

    node.rank = INVALID_RANK;
    node.nextPeer = node;
    node.prevPeer = node;

    return true;
  }

  popMin(): Node | null {
    const top = this.topMask;
    if (!top) return null;

    const group = ctz32(top);
    const leaf = this.leafMasks[group]!;

    const index = ctz32(leaf);
    const rank = (group << GROUP_SHIFT) | index;

    const node = this.buckets[rank]!;
    this.remove(node);

    return node;
  }

  isEmpty() {
    return this.topMask === 0;
  }

  clear(): void {
    for (let rank = 0; rank < MAX_RANKS; ++rank) {
      const head = this.buckets[rank];

      if (head !== null) {
        let node = head!;

        do {
          const next = <Node>node.nextPeer;

          node.rank = INVALID_RANK;
          node.nextPeer = node;
          node.prevPeer = node;

          node = next;
        } while (node !== head);
      }
      this.buckets[rank] = null;
    }

    this.topMask = 0;
    this.leafMasks.fill(0);
  }
}

function ctz32(x: number): number {
  return 31 - Math.clz32(x & -x);
}

export { RankedQueue };
