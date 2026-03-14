import { ReactiveNode, ReactiveNodeState } from './core.js'

const GAP = 1 << 20

export class OrderList {
  head: ReactiveNode | null = null
  tail: ReactiveNode | null = null
  private _size = 0

  push(node: ReactiveNode): void {
    const prev = this.tail
    node.prev  = prev
    node.next  = null
    node.order = prev ? prev.order + GAP : 0
    if (prev) prev.next = node
    else      this.head = node
    this.tail  = node
    node.state |= ReactiveNodeState.Ordered
    this._size++
  }

  insertAfter(node: ReactiveNode, after: ReactiveNode): void {
    const right = after.next
    const lo    = after.order
    const hi    = right ? right.order : lo + (GAP << 1)
    node.order  = lo + ((hi - lo) >> 1)
    node.prev   = after
    node.next   = right
    after.next  = node
    if (right) right.prev = node
    else       this.tail  = node
    node.state |= ReactiveNodeState.Ordered
    this._size++
    if (hi - lo <= 1) this._relabel(node)
  }

  remove(node: ReactiveNode): void {
    const { prev, next } = node
    if (prev) prev.next = next; else this.head = next
    if (next) next.prev = prev; else this.tail = prev
    node.prev  = null
    node.next  = null
    node.state &= ~ReactiveNodeState.Ordered
    this._size--
  }

  moveAfter(node: ReactiveNode, after: ReactiveNode): void {
    this.remove(node)
    this.insertAfter(node, after)
  }

  before(a: ReactiveNode, b: ReactiveNode): boolean {
    return a.order < b.order
  }

  private _relabel(node: ReactiveNode): void {
    const win: ReactiveNode[] = []
    let cur: ReactiveNode | null = node
    while (cur && win.length < 64) { win.unshift(cur); cur = cur.prev }
    const base  = cur ? cur.order : -(1 << 24)
    const after = node.next ? node.next.order : base + (GAP << 2)
    const step  = Math.floor((after - base) / (win.length + 1))
    win.forEach((n, i) => { n.order = base + step * (i + 1) })
  }

  get length() { return this._size }

  *[Symbol.iterator](): Iterator<ReactiveNode> {
    let cur = this.head
    while (cur) { yield cur; cur = cur.next }
  }
}