import { describe, expect, it, vi } from "vitest";
import {
  EventSource,
  EventSubscriber,
  EventSubscriberState,
  appendSubscriber,
  emitEvent,
  identityBoundary,
  removeSubscriber,
  subscribeEvent,
  type EventBoundary,
} from "../src/reactivity/shape/ReactiveEvent"; // поправь путь под свой проект

describe("event system", () => {
  it("delivers event to a single subscriber", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();

    subscribeEvent(source, fn);
    emitEvent(source, 123);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(123);
  });

  it("delivers event to multiple subscribers in subscription order", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    subscribeEvent(source, () => calls.push("a"));
    subscribeEvent(source, () => calls.push("b"));
    subscribeEvent(source, () => calls.push("c"));

    emitEvent(source, 1);

    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("unsubscribe stops future deliveries", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();

    const dispose = subscribeEvent(source, fn);

    emitEvent(source, 1);
    dispose();
    emitEvent(source, 2);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
  });

  it("double unsubscribe is safe", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();

    const dispose = subscribeEvent(source, fn);

    dispose();
    dispose();

    emitEvent(source, 1);

    expect(fn).not.toHaveBeenCalled();
    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });

  it("self-unsubscribe during emit does not break traversal", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    let disposeA!: () => void;

    disposeA = subscribeEvent(source, () => {
      calls.push("a");
      disposeA();
    });

    subscribeEvent(source, () => {
      calls.push("b");
    });

    emitEvent(source, 1);
    emitEvent(source, 2);

    expect(calls).toEqual(["a", "b", "b"]);
  });

  it("unsubscribing the next subscriber during emit prevents its execution", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    const disposeB = subscribeEvent(source, () => {
      calls.push("b");
    });

    subscribeEvent(source, () => {
      calls.push("a");
      disposeB();
    });

    // порядок подписки сейчас: b, a
    // чтобы a отписал b до его вызова, надо подписать a раньше
    const source2 = new EventSource<number>();
    const calls2: string[] = [];

    let disposeB2!: () => void;

    subscribeEvent(source2, () => {
      calls2.push("a");
      disposeB2();
    });

    disposeB2 = subscribeEvent(source2, () => {
      calls2.push("b");
    });

    emitEvent(source2, 1);

    expect(calls2).toEqual(["a"]);
  });

  it("unsubscribing a previous subscriber during emit does not break traversal", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    let disposeA!: () => void;

    disposeA = subscribeEvent(source, () => {
      calls.push("a");
    });

    subscribeEvent(source, () => {
      calls.push("b");
      disposeA();
    });

    subscribeEvent(source, () => {
      calls.push("c");
    });

    emitEvent(source, 1);
    emitEvent(source, 2);

    expect(calls).toEqual(["a", "b", "c", "b", "c"]);
  });

  it("subscriber added during emit does not run in the same emit", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    subscribeEvent(source, () => {
      calls.push("a");

      subscribeEvent(source, () => {
        calls.push("late");
      });
    });

    emitEvent(source, 1);
    expect(calls).toEqual(["a"]);

    emitEvent(source, 2);
    expect(calls).toEqual(["a", "a", "late"]);
  });

  it("deferred unlink keeps removed subscriber pending until dispatch completes", () => {
    const source = new EventSource<number>();

    let disposeA!: () => void;
    let subscriberWasStillLinkedDuringDispatch = false;

    disposeA = subscribeEvent(source, () => {
      disposeA();

      // во время dispatch узел еще физически может быть в списке
      subscriberWasStillLinkedDuringDispatch =
        source.head !== null || source.tail !== null;
    });

    emitEvent(source, 1);

    expect(subscriberWasStillLinkedDuringDispatch).toBe(true);
    expect(source.pendingHead).toBeNull();
    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });

  it("flushes pending removals after nested emits complete", () => {
    const source = new EventSource<number>();
    const calls: string[] = [];

    let disposeA!: () => void;

    disposeA = subscribeEvent(source, (value) => {
      calls.push(`a:${value}`);

      if (value === 1) {
        disposeA();
        emitEvent(source, 2);
      }
    });

    subscribeEvent(source, (value) => {
      calls.push(`b:${value}`);
    });

    emitEvent(source, 1);

    expect(calls).toEqual(["a:1", "b:2", "b:1"]);
    expect(source.pendingHead).toBeNull();
  });

  it("does not call inactive subscribers", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();

    const dispose = subscribeEvent(source, fn);
    dispose();

    emitEvent(source, 1);

    expect(fn).not.toHaveBeenCalled();
  });

  it("calls boundary exactly once per emitEvent invocation", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();
    const boundarySpy = vi.fn(<T>(run: () => T): T => run());

    subscribeEvent(source, fn);
    emitEvent(source, 42, boundarySpy as any);

    expect(boundarySpy).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it("does nothing when source has no subscribers", () => {
    const source = new EventSource<number>();
    const boundarySpy = vi.fn(<T>(run: () => T): T => run());

    emitEvent(source, 1, boundarySpy as any);

    expect(boundarySpy).toHaveBeenCalledTimes(1);
    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });

  it("marks subscriber as disposed after immediate removal outside dispatch", () => {
    const source = new EventSource<number>();
    const fn = vi.fn<(value: number) => void>();

    let capturedDispose!: () => void;
    let capturedSubscriberState: number | undefined;

    const dispose = subscribeEvent(source, fn);
    capturedDispose = dispose;

    capturedDispose();

    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });
});

describe("event system internals", () => {
  function createSubscriber<T>(fn: (value: T) => void): EventSubscriber<T> {
    return {
      fn,
      next: null,
      prev: null,
      state: EventSubscriberState.Active,
      unlinkNext: null,
    };
  }

  it("appendSubscriber links first node as both head and tail", () => {
    const source = new EventSource<number>();
    const sub = createSubscriber(() => {});

    appendSubscriber(source, sub);

    expect(source.head).toBe(sub);
    expect(source.tail).toBe(sub);
    expect(sub.prev).toBeNull();
    expect(sub.next).toBeNull();
  });

  it("appendSubscriber links nodes as a doubly linked list", () => {
    const source = new EventSource<number>();
    const a = createSubscriber(() => {});
    const b = createSubscriber(() => {});
    const c = createSubscriber(() => {});

    appendSubscriber(source, a);
    appendSubscriber(source, b);
    appendSubscriber(source, c);

    expect(source.head).toBe(a);
    expect(source.tail).toBe(c);

    expect(a.prev).toBeNull();
    expect(a.next).toBe(b);

    expect(b.prev).toBe(a);
    expect(b.next).toBe(c);

    expect(c.prev).toBe(b);
    expect(c.next).toBeNull();
  });

  it("removeSubscriber unlinks immediately outside dispatch", () => {
    const source = new EventSource<number>();
    const a = createSubscriber(() => {});
    const b = createSubscriber(() => {});
    const c = createSubscriber(() => {});

    appendSubscriber(source, a);
    appendSubscriber(source, b);
    appendSubscriber(source, c);

    removeSubscriber(source, b);

    expect(source.head).toBe(a);
    expect(source.tail).toBe(c);

    expect(a.next).toBe(c);
    expect(c.prev).toBe(a);

    expect(b.prev).toBeNull();
    expect(b.next).toBeNull();
    expect((b.state & EventSubscriberState.Active) === 0).toBe(true);
    expect((b.state & EventSubscriberState.Disposed) !== 0).toBe(true);
  });

  it("removeSubscriber of head updates head", () => {
    const source = new EventSource<number>();
    const a = createSubscriber(() => {});
    const b = createSubscriber(() => {});

    appendSubscriber(source, a);
    appendSubscriber(source, b);

    removeSubscriber(source, a);

    expect(source.head).toBe(b);
    expect(source.tail).toBe(b);
    expect(b.prev).toBeNull();
  });

  it("removeSubscriber of tail updates tail", () => {
    const source = new EventSource<number>();
    const a = createSubscriber(() => {});
    const b = createSubscriber(() => {});

    appendSubscriber(source, a);
    appendSubscriber(source, b);

    removeSubscriber(source, b);

    expect(source.head).toBe(a);
    expect(source.tail).toBe(a);
    expect(a.next).toBeNull();
  });
});
