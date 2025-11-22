import { GraphNode } from "../../core/graph/graph.node"
import { unlinkAllSources } from "../../core/graph/graph.operations"
import { withObserver, track } from "../execution/context.stack"

export class Computation<T> extends GraphNode {
  _fn: () => T
  _value!: T

  constructor(fn: () => T) {
    super()
    this._flags |= (1 << 1) // KIND_COMPUTATION
    this._fn = fn

    this._recompute()
  }

  private _recompute() {
    unlinkAllSources(this)

    withObserver(this, () => {
      this._value = this._fn()
    })
  }

  get(): T {
    track(this)
    return this._value
  }
}
