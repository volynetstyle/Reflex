// import { describe, bench } from "vitest";

// import {
//   linkSourceToObserverUnsafe,
//   unlinkSourceFromObserverUnsafe,
//   unlinkAllObserversUnsafe,
//   unlinkEdgeUnsafe,
// } from "../../src/graph";

// import { GraphNode, GraphEdge } from "../../src/graph";

// /** Create node */
// function makeNode(): GraphNode {
//   return new GraphNode(0);
// }

// describe("DAG O(1) intrusive graph benchmarks (edge-based)", () => {
//   // ──────────────────────────────────────────────────────────────
//   // 1. Basic 1k link/unlink cycles for both APIs
//   // ──────────────────────────────────────────────────────────────

//   bench("GraphService.addObserver/removeObserver (1k ops)", () => {
//     const A = makeNode();
//     const B = makeNode();

//     for (let i = 0; i < 1000; i++) {
//       r.addObserver(A, B);
//       r.removeObserver(A, B);
//     }
//   });

//   bench("Unsafe link/unlink (1k ops)", () => {
//     const A = makeNode();
//     const B = makeNode();

//     for (let i = 0; i < 1000; i++) {
//       linkSourceToObserverUnsafe(A, B);
//       unlinkSourceFromObserverUnsafe(A, B);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 1b. Optimized: Store edge reference and use unlinkEdgeUnsafe
//   // ──────────────────────────────────────────────────────────────

//   bench("Optimized: link + unlinkEdgeUnsafe with stored ref (1k ops)", () => {
//     const A = makeNode();
//     const B = makeNode();

//     for (let i = 0; i < 1000; i++) {
//       const edge = linkSourceToObserverUnsafe(A, B);
//       unlinkEdgeUnsafe(edge); // O(1) guaranteed
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 2. Mixed random link/unlink operations
//   // ──────────────────────────────────────────────────────────────

//   bench("1000 mixed link/unlink operations (random-ish)", () => {
//     const nodes = Array.from({ length: 50 }, makeNode);

//     for (let i = 0; i < 1000; i++) {
//       const a = nodes[(i * 5) % nodes.length]!;
//       const b = nodes[(i * 17) % nodes.length]!;

//       if (a !== b) {
//         r.addObserver(a, b);
//         if (i % 2 === 0) r.removeObserver(a, b);
//       }
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 3. Star linking - both approaches
//   // ──────────────────────────────────────────────────────────────

//   bench("star graph: 1 source → 1k observers (GraphService)", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       r.addObserver(source, obs);
//     }
//   });

//   bench("star graph: 1 source → 1k observers (unsafe direct)", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(source, obs);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 4. Star unlink (bulk) - different strategies
//   // ──────────────────────────────────────────────────────────────

//   bench("star unlink: unlinkAllObserversUnsafe (1k edges)", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(source, obs);
//     }

//     unlinkAllObserversUnsafe(source);
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 5. Star unlink piecewise - both approaches
//   // ──────────────────────────────────────────────────────────────

//   bench("star unlink: removeObserver individually (1k ops)", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       r.addObserver(source, obs);
//     }

//     for (const obs of observers) {
//       r.removeObserver(source, obs);
//     }
//   });

//   bench(
//     "star unlink: unlinkSourceFromObserverUnsafe individually (1k ops)",
//     () => {
//       const source = makeNode();
//       const observers = Array.from({ length: 1000 }, makeNode);

//       for (const obs of observers) {
//         linkSourceToObserverUnsafe(source, obs);
//       }

//       for (const obs of observers) {
//         unlinkSourceFromObserverUnsafe(source, obs);
//       }
//     },
//   );

//   // ──────────────────────────────────────────────────────────────
//   // 5b. Optimized approach: store edges and unlink with O(1)
//   // ──────────────────────────────────────────────────────────────

//   bench(
//     "star unlink OPTIMIZED: stored edges + unlinkEdgeUnsafe (1k ops)",
//     () => {
//       const source = makeNode();
//       const observers = Array.from({ length: 1000 }, makeNode);
//       const edges: GraphEdge[] = [];

//       // Link and store edge references
//       for (const obs of observers) {
//         edges.push(linkSourceToObserverUnsafe(source, obs));
//       }

//       // Unlink with O(1) per edge
//       for (const edge of edges) {
//         unlinkEdgeUnsafe(edge);
//       }
//     },
//   );

//   // ──────────────────────────────────────────────────────────────
//   // 6. Duplicate detection benchmark (hot path optimization)
//   // ──────────────────────────────────────────────────────────────

//   bench("duplicate detection: repeated links to same observer (1k ops)", () => {
//     const source = makeNode();
//     const observer = makeNode();

//     // First link creates edge
//     linkSourceToObserverUnsafe(source, observer);

//     // Next 999 should hit O(1) fast path
//     for (let i = 0; i < 999; i++) {
//       linkSourceToObserverUnsafe(source, observer);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 7. Random DAG simulation (10k edges)
//   // ──────────────────────────────────────────────────────────────

//   bench("DAG simulation: 100 nodes, 10k random edges", () => {
//     const nodes = Array.from({ length: 100 }, makeNode);

//     for (let i = 0; i < 10000; i++) {
//       const a = nodes[Math.floor(Math.random() * 100)]!;
//       const b = nodes[Math.floor(Math.random() * 100)]!;
//       if (a !== b) {
//         linkSourceToObserverUnsafe(a, b);
//       }
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 8. Degree counting sanity test
//   // ──────────────────────────────────────────────────────────────

//   bench("degree counting: 1k nodes, sparse DAG connections", () => {
//     const nodes = Array.from({ length: 1000 }, makeNode);

//     // Sparse layering: DAG i → (i+1..i+4)
//     for (let i = 0; i < 1000; i++) {
//       const src = nodes[i]!;
//       for (let j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
//         r.addObserver(src, nodes[j]!);
//       }
//     }

//     let sumOut = 0;
//     let sumIn = 0;

//     for (const n of nodes) {
//       sumOut += n.outCount;
//       sumIn += n.inCount;
//     }

//     if (sumOut !== sumIn) {
//       throw new Error(
//         `Degree mismatch: OUT=${sumOut}, IN=${sumIn} — graph invariant broken`,
//       );
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 9. Traversal benchmarks
//   // ──────────────────────────────────────────────────────────────

//   bench("forEachObserver: traverse 1k observers", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(source, obs);
//     }

//     let count = 0;
//     r.forEachObserver(source, () => {
//       count++;
//     });

//     if (count !== 1000) {
//       throw new Error(`Expected 1000 observers, got ${count}`);
//     }
//   });

//   bench("forEachSource: traverse 1k sources", () => {
//     const observer = makeNode();
//     const sources = Array.from({ length: 1000 }, makeNode);

//     for (const src of sources) {
//       linkSourceToObserverUnsafe(src, observer);
//     }

//     let count = 0;
//     r.forEachSource(observer, () => {
//       count++;
//     });

//     if (count !== 1000) {
//       throw new Error(`Expected 1000 sources, got ${count}`);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 10. replaceSource benchmark
//   // ──────────────────────────────────────────────────────────────

//   bench("replaceSource: swap 1k dependencies", () => {
//     const oldSource = makeNode();
//     const newSource = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     // Link all observers to oldSource
//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(oldSource, obs);
//     }

//     // Replace oldSource with newSource for all observers
//     for (const obs of observers) {
//       r.replaceSource(oldSource, newSource, obs);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 11. hasObserver/hasSource benchmarks
//   // ──────────────────────────────────────────────────────────────

//   bench("hasObserver: check 1k times (hit at lastOut)", () => {
//     const source = makeNode();
//     const observer = makeNode();

//     linkSourceToObserverUnsafe(source, observer);

//     // Should hit O(1) fast path via lastOut
//     for (let i = 0; i < 1000; i++) {
//       r.hasObserver(source, observer);
//     }
//   });

//   bench("hasObserver: check 1k times (miss, full scan)", () => {
//     const source = makeNode();
//     const observer = makeNode();
//     const otherObserver = makeNode();

//     // Add many observers, but not otherObserver
//     for (let i = 0; i < 100; i++) {
//       linkSourceToObserverUnsafe(source, makeNode());
//     }

//     // Should do O(k) scan each time
//     for (let i = 0; i < 1000; i++) {
//       r.hasObserver(source, otherObserver);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 12. Memory stress test: create and destroy large graph
//   // ──────────────────────────────────────────────────────────────

//   bench("memory stress: build 10k edges, then destroy all", () => {
//     const nodes = Array.from({ length: 100 }, makeNode);

//     // Build dense graph
//     for (let i = 0; i < 10000; i++) {
//       const a = nodes[i % 100]!;
//       const b = nodes[(i + 1) % 100]!;
//       if (a !== b) {
//         linkSourceToObserverUnsafe(a, b);
//       }
//     }

//     // Destroy all
//     for (const node of nodes) {
//       r.removeNode(node);
//     }
//   });

//   // ──────────────────────────────────────────────────────────────
//   // 13. Worst case: unlink from middle of large adjacency list
//   // ──────────────────────────────────────────────────────────────

//   bench("worst case unlink: remove from middle of 1k adjacency list", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(source, obs);
//     }

//     // Unlink the middle observer (worst case for unlinkSourceFromObserverUnsafe)
//     const middleObserver = observers[500]!;
//     unlinkSourceFromObserverUnsafe(source, middleObserver);
//   });

//   bench("best case unlink: remove lastOut from 1k adjacency list", () => {
//     const source = makeNode();
//     const observers = Array.from({ length: 1000 }, makeNode);

//     for (const obs of observers) {
//       linkSourceToObserverUnsafe(source, obs);
//     }

//     // Unlink the last observer (best case - O(1) via lastOut check)
//     const lastObserver = observers[999]!;
//     unlinkSourceFromObserverUnsafe(source, lastObserver);
//   });
// });
