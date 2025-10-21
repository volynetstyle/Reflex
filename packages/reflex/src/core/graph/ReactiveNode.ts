/**
 * @file ReactiveNode.ts
 *
 * Vertex = ReactiveNode.
 *
 * Represents a node in a directed acyclic graph (DAG)
 * Each vertex is an immutable computation unit:
 * it holds the result of a function depending on other vertices.
 *
 * Conceptually:
 *  - Inputs: upstream dependencies (edges in)
 *  - Outputs: downstream dependents (edges out)
 *  - Value: cached computation result
 *
 * Vertices are immutable; updates produce new versions,
 * allowing structural sharing and time-travel debugging.
 */
