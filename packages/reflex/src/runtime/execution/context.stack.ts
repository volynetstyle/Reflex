import { GraphNode } from "../../core/graph/graph.node"
import { linkEdge } from "../../core/graph/graph.operations"

let currentObserver: GraphNode | null = null

export function withObserver<T>(node: GraphNode, fn: () => T): T {
  const prev = currentObserver
  currentObserver = node
  try {
    return fn()
  } finally {
    currentObserver = prev
  }
}


export function track(source: GraphNode) {
  if (currentObserver === null) return
  linkEdge(currentObserver, source)
}