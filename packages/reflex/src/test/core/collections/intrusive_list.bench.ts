import { IntrusiveListNode, newIntrusiveList } from "#reflex/core/collections/intrusive_list.js";
import { bench, describe } from "vitest";

type Node = IntrusiveListNode<{ id: number }> & { id: number };

const make = (id: number): Node => ({ id });

describe("IntrusiveList microbench", () => {
    const N = 50_000;

    bench("push N", () => {
        const list = newIntrusiveList<Node>();
        for (let i = 0; i < N; i++) list.push(make(i));
    });

    bench("push N then iterate forEach", () => {
        const list = newIntrusiveList<Node>();
        for (let i = 0; i < N; i++) list.push(make(i));
        let s = 0;
        list.forEach(v => { s += v.id & 1; });
    });

    bench("push N then remove every 3rd", () => {
        const list = newIntrusiveList<Node>();
        const nodes: Node[] = [];
        for (let i = 0; i < N; i++) {
            const n = make(i);
            nodes.push(n);
            list.push(n);
        }
        for (let i = 0; i < N; i += 3) list.remove(nodes[i]);
    });

    bench("clear after push N", () => {
        const list = newIntrusiveList<Node>();
        for (let i = 0; i < N; i++) list.push(make(i));
        list.clear();
    });
});
