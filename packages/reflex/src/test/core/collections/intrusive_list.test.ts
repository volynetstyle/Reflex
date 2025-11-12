import { IntrusiveListNode, newIntrusiveList } from "#reflex/core/collections/intrusive_list.js";
import { describe, it, expect } from "vitest";

type Node = IntrusiveListNode<{ id: number }> & { id: number };

function node(id: number): Node {
    return { _prev: undefined, _next: undefined, _list: undefined, id };
}

describe("IntrusiveList basic", () => {
    it("push & iteration", () => {
        const list = newIntrusiveList<Node>();
        const a = node(1), b = node(2), c = node(3);

        list.push(a);
        list.push(b);
        list.push(c);

        const seen: number[] = [];
        list.forEach(v => seen.push(v.id));
        expect(seen).toEqual([1, 2, 3]);

        expect(list.size()).toBe(3);
        expect(list.isEmpty()).toBe(false);
    });

    it("remove middle", () => {
        const list = newIntrusiveList<Node>();
        const a = node(1), b = node(2), c = node(3);

        list.push(a); list.push(b); list.push(c);
        list.remove(b);

        const seen: number[] = [];
        list.forEach(v => seen.push(v.id));
        expect(seen).toEqual([1, 3]);
        expect(a._next).toBe(c);
        expect(c._prev).toBe(a);
        expect(b._list).toBeUndefined();
        expect(list.size()).toBe(2);
    });

    it("remove head & tail", () => {
        const list = newIntrusiveList<Node>();
        const a = node(1), b = node(2), c = node(3);

        list.push(a); list.push(b); list.push(c);
        list.remove(a); // remove head
        list.remove(c); // remove tail

        const seen: number[] = [];
        list.forEach(v => seen.push(v.id));
        expect(seen).toEqual([2]);
        expect(list.size()).toBe(1);
        expect(list.isEmpty()).toBe(false);

        list.remove(b);
        expect(list.size()).toBe(0);
        expect(list.isEmpty()).toBe(true);
    });

    it("clear()", () => {
        const list = newIntrusiveList<Node>();
        const a = node(1), b = node(2), c = node(3);
        list.push(a); list.push(b); list.push(c);

        list.clear();
        expect(list.size()).toBe(0);
        expect(list.isEmpty()).toBe(true);

        // Повторный clear — no-op
        list.clear();
        expect(list.size()).toBe(0);
    });

    it("safe removal during forEach", () => {
        const list = newIntrusiveList<Node>();
        const a = node(1), b = node(2), c = node(3), d = node(4);
        list.push(a); list.push(b); list.push(c); list.push(d);

        // Удаляем каждый чётный внутри обхода
        list.forEachNode(n => {
            const v = (n as any as { id: number }).id;
            if (v % 2 === 0) list.remove(n);
        });

        const seen: number[] = [];
        list.forEach(v => seen.push(v.id));
        expect(seen).toEqual([1, 3]);
        expect(list.size()).toBe(2);
    });

    it("idempotent remove and push guards", () => {
        const listA = newIntrusiveList<Node>();
        const listB = newIntrusiveList<Node>();
        const x = node(42);

        listA.push(x);
        listA.push(x); // повторный push игнорируется
        expect(listA.size()).toBe(1);

        listB.push(x); // игнорируется, т.к. x уже в listA
        expect(listB.size()).toBe(0);
        expect(listA.size()).toBe(1);

        listA.remove(x);
        listA.remove(x); // повторный remove — no-op
        expect(listA.size()).toBe(0);
    });
});
