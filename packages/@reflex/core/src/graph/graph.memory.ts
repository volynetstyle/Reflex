// import { GraphEdge, GraphNode } from "./graph.node";

// const NODE_POOL_MAX = 128;
// /** Default node size most stable for V8 (power of two) */
// const DEFAULT_NODE_SIZE = 512 as const;

// class EdgesFragment {
//   readonly buffer: GraphEdge[];

//   write: number = 0;
//   next: EdgesFragment | null = null;
//   generation: number = 0;

//   constructor() {
//     this.buffer = new Array<GraphEdge>(DEFAULT_NODE_SIZE);
//   }

//   append(edge: GraphEdge): boolean {
//     if (this.write === this.buffer.length) return false;
//     this.buffer[this.write++] = edge;
//     return true;
//   }

//   forEach(fn: (edge: GraphEdge) => void) {
//     for (let i = 0; i < this.write; i++) {
//       fn(this.buffer[i]!);
//     }
//   }

//   reset(generation: number) {
//     this.write = 0;
//     this.generation = generation;
//   }
// }

// class EdgesArena {
//   private head: EdgesFragment | null = null;
//   private tail: EdgesFragment | null = null;

//   append(edge: GraphEdge) {
//     if (!this.tail || !this.tail.append(edge)) {
//       const frag = this.allocFragment(this.currentGeneration);
//       frag.append(edge);
//     }
//   }

//   allocFragment(gen: number): EdgesFragment {
//     const frag = new EdgesFragment();
//     frag.generation = gen;

//     if (this.tail) {
//       this.tail.next = frag;
//       this.tail = frag;
//     } else {
//       this.head = this.tail = frag;
//     }

//     return frag;
//   }
// }

// class VerticesSlab {
//   readonly buffer: GraphNode[];
//   size = 0;

//   constructor(capacity: number) {
//     this.buffer = new Array(capacity);
//   }

//   alloc(node: GraphNode) {
//     this.buffer[this.size++] = node;
//   }
// }
