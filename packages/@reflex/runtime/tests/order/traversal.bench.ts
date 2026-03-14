import { bench, describe } from "vitest";
import { ReactiveNode } from "../../src/reactivity/shape";
import { connect } from "../../src/reactivity/shape/methods/connect";

/* -------------------------------------------------- */
/* CONFIG */
/* -------------------------------------------------- */

const N = 2000;
const WIDTH = 200;
const DEPTH = 4;

/* -------------------------------------------------- */
/* GRAPH BUILDERS */
/* -------------------------------------------------- */

function buildPeerList(n: number) {
  const first = new ReactiveNode(0, 0);
  let prev = first;

  for (let i = 1; i < n; i++) {
    const node = new ReactiveNode(0, 0);

    prev.nextPeer = node;
    node.prevPeer = prev;

    prev = node;
  }

  return first;
}

function buildEdgeChain(n: number) {
  const nodes: ReactiveNode[] = [];

  for (let i = 0; i < n; i++) {
    nodes.push(new ReactiveNode(0, 0));
  }

  for (let i = 0; i < n - 1; i++) {
    connect(nodes[i]!, nodes[i + 1]!);
  }

  return nodes[0];
}

function buildWideGraph(width: number) {
  const root = new ReactiveNode(0, 0);

  for (let i = 0; i < width; i++) {
    const node = new ReactiveNode(0, 0);
    connect(root, node);
  }

  return root;
}

function buildArrayChain(n: number) {
  const nodes: ReactiveNode[] = new Array(n);

  for (let i = 0; i < n; i++) {
    nodes[i] = new ReactiveNode(0, 0);
  }

  return nodes;
}

function buildDense(n: number) {
  const nodes: ReactiveNode[] = [];

  for (let i = 0; i < n; i++) {
    nodes.push(new ReactiveNode(0, 0));
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < Math.min(n, i + 4); j++) {
      connect(nodes[i]!, nodes[j]!);
    }
  }

  return nodes[0];
}

function buildCatastrophicGraph() {
  const layers: ReactiveNode[][] = [];

  for (let d = 0; d < DEPTH; d++) {
    const layer: ReactiveNode[] = [];

    for (let i = 0; i < WIDTH; i++) {
      layer.push(new ReactiveNode(0, 0));
    }

    layers.push(layer);
  }

  for (let d = 1; d < DEPTH; d++) {
    const prev = layers[d - 1]!;
    const curr = layers[d]!;

    for (const a of prev) {
      for (const b of curr) {
        connect(a, b);
      }
    }
  }

  return layers[0]![0];
}

/* -------------------------------------------------- */
/* TRAVERSALS */
/* -------------------------------------------------- */

function traverseArray(nodes: ReactiveNode[]) {
  let sum = 0;

  for (let i = 0; i < nodes.length; i++) {
    sum++;
  }

  return sum;
}

function traversePeers(first: ReactiveNode) {
  let node: ReactiveNode | null = first;
  let sum = 0;

  while (node) {
    sum++;
    node = node.nextPeer;
  }

  return sum;
}

let visitClock = 1;

function traverseEdges(root: ReactiveNode) {
  const stack: ReactiveNode[] = [root];
  const mark = visitClock++;

  let sum = 0;

  while (stack.length) {
    const node = stack.pop()!;

    if (node.v === mark) continue;
    node.v = mark;

    sum++;

    let edge = node.firstOut;

    while (edge) {
      stack.push(edge.to);
      edge = edge.nextOut;
    }
  }

  return sum;
}

/* -------------------------------------------------- */
/* GRAPH INSTANCES */
/* -------------------------------------------------- */

const peerChain = buildPeerList(N)!;
const edgeChain = buildEdgeChain(N)!;

const peerWide = buildPeerList(N)!;
const wideGraph = buildWideGraph(N)!;

const arrayChain = buildArrayChain(N);
const arrayWide = buildArrayChain(N);
const dense = buildDense(500)!;
const catastrophic = buildCatastrophicGraph()!;

/* -------------------------------------------------- */
/* BENCHMARKS */
/* -------------------------------------------------- */

describe("Reactive Graph Traversal Benchmarks", () => {
  bench("Peer traversal (chain)", () => {
    traversePeers(peerChain);
  });

  bench("Edge traversal (chain)", () => {
    traverseEdges(edgeChain);
  });

  bench("Edge traversal (wide)", () => {
    traverseEdges(wideGraph);
  });

  bench("Peer traversal (wide)", () => {
    traversePeers(peerWide);
  });

  bench("Array traversal (chain)", () => {
    traverseArray(arrayChain);
  });

  bench("Array traversal (wide)", () => {
    traverseArray(arrayWide);
  });

  bench("Edge traversal (dense)", () => {
    traverseEdges(dense);
  });

  bench("Edge traversal (catastrophic graph)", () => {
    traverseEdges(catastrophic);
  });
});
