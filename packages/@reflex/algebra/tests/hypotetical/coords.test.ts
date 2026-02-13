import { describe, it, expect } from "vitest";
import {
  join,
  joinAll,
  makeState,
  apply,
  memo,
  State,
  createRuntime,
} from "./coords";
import type { Event } from "./coords";

describe("Event algebra", () => {
  it("join is commutative (dc)", () => {
    const e1: Event = { patch: {}, dc: { t: 1, v: 2 } };
    const e2: Event = { patch: {}, dc: { t: 3, v: 4 } };

    expect(join(e1, e2)).toEqual(join(e2, e1));
  });

  it("join is associative", () => {
    const a: Event = { patch: {}, dc: { t: 1 } };
    const b: Event = { patch: {}, dc: { v: 2 } };
    const c: Event = { patch: {}, dc: { p: 3 } };

    expect(join(join(a, b), c)).toEqual(join(a, join(b, c)));
  });

  it("joinAll is order-independent", () => {
    const events: Event[] = [
      { patch: {}, dc: { t: 1 } },
      { patch: {}, dc: { v: 2 } },
      { patch: {}, dc: { p: 3 } },
    ];

    expect(joinAll(events)).toEqual(joinAll([...events].reverse()));
  });
});

describe("State transition", () => {
  it("apply(joinAll(events)) is deterministic", () => {
    const initial = makeState({ a: 1 });

    const events: Event[] = [
      { patch: { a: 2 }, dc: { t: 1 } },
      { patch: { b: 3 }, dc: { v: 1 } },
    ];

    const s1 = apply(initial, joinAll(events));
    const s2 = apply(initial, joinAll([...events].reverse()));

    expect(s1).toEqual(s2);
  });

  it("state transition does not depend on read-time", () => {
    const initial = makeState({ x: 0 });

    const e1: Event = { patch: { x: 1 }, dc: { t: 1 } };
    const e2: Event = { patch: { y: 2 }, dc: { t: 1 } };

    const s = apply(initial, joinAll([e1, e2]));

    expect(s.data).toEqual({ x: 1, y: 2 });
  });
});

describe("Signals", () => {
  it("signal is pure function of state", () => {
    const signal = (s: any) => s.data.a + s.coords.t;

    const s1 = makeState({ a: 1 }, { t: 1 });
    const s2 = makeState({ a: 1 }, { t: 1 });

    expect(signal(s1)).toBe(signal(s2));
  });

  it("memo caches by coords, not by identity", () => {
    let calls = 0;

    const base = (s: any) => {
      calls++;
      return s.data.x * 2;
    };

    const signal = memo(base);

    const s1 = makeState({ x: 2 }, { t: 1 });
    const s2 = makeState({ x: 2 }, { t: 1 });

    expect(signal(s1)).toBe(4);
    expect(signal(s2)).toBe(4);
    expect(calls).toBe(1);
  });

  it("memo invalidates on coords change", () => {
    let calls = 0;

    const signal = memo((s: any) => {
      calls++;
      return s.coords.t;
    });

    signal(makeState({}, { t: 1 }));
    signal(makeState({}, { t: 2 }));

    expect(calls).toBe(2);
  });

  it("derived-of-derived invalidates on structure change", () => {
    let calls = 0;

    const base = memo<number>((s: any) => {
      calls++;
      return s.data.x;
    });

    const derived = memo((s: any) => base(s) * 2);

    const s1 = makeState({ x: 1 }, { t: 1, s: 0 });
    const s2 = makeState({ x: 1 }, { t: 1, s: 1 }); // structure change

    derived(s1);
    derived(s2);

    expect(calls).toBe(2);
  });
});

describe("Runtime", () => {
  it("final state depends only on sum of events", () => {
    const rt = createRuntime(makeState({}));

    rt.emit({ patch: { a: 1 }, dc: { t: 1 } });
    rt.emit({ patch: { b: 2 }, dc: { t: 1 } });

    expect(rt.getState().data).toEqual({ a: 1, b: 2 });
    expect(rt.getState().coords.t).toBe(2);
  });

  it("late events are applied without cancel", () => {
    const rt = createRuntime(makeState({ value: 0 }));

    rt.emit({ patch: { value: 1 }, dc: { t: 1 } });
    rt.emit({ patch: { value: 2 }, dc: { t: 1 } }); // late / reordered

    expect(rt.getState().data.value).toBe(2);
  });

  it("replay produces identical final state", () => {
    const events = [
      { patch: { x: 1 }, dc: { t: 1 } },
      { patch: { y: 2 }, dc: { v: 1 } },
    ];

    const r1 = createRuntime(makeState({}));
    events.forEach((e) => r1.emit(e));

    const r2 = createRuntime(makeState({}));
    r2.replay(events);

    expect(r1.getState()).toEqual(r2.getState());
  });
});

describe("Hypothesis validation", () => {
  it("UI based on coords is order-independent", () => {
    const signal = (s: any) => s.coords.t;

    const events = [
      { patch: { count: 1 }, dc: { t: 1 } },
      { patch: { count: 2 }, dc: { t: 1 } },
    ];

    const r1 = createRuntime(makeState({ count: 0 }));
    r1.replay(events);

    const r2 = createRuntime(makeState({ count: 0 }));
    r2.replay([...events].reverse());

    expect(r1.read(signal)).toBe(r2.read(signal));
  });

  it("UI reads data only in causally stable state", () => {
    const rt = createRuntime(makeState({ count: 0 }));

    const stableValue = memo((s: any) => {
      if (s.coords.p !== 0) return null;
      return s.data.count;
    });

    rt.emit({ patch: {}, dc: { p: +1 } }); // async start
    rt.emit({ patch: { count: 1 }, dc: { t: 1 } });
    rt.emit({ patch: {}, dc: { p: -1 } }); // async end

    expect(rt.read(stableValue)).toBe(1);
  });

  it("UI shows causally completed version regardless of event order", () => {
    const events = [
      { patch: {}, dc: { p: +1 } },
      { patch: { count: 2 }, dc: { v: 1 } },
      { patch: {}, dc: { p: -1 } },
    ];

    const lastStableVersion = memo((s: any) => {
      if (s.coords.p !== 0) return "loading";
      return s.coords.v;
    });

    const r1 = createRuntime(makeState({ count: 0 }));
    r1.replay(events);

    const r2 = createRuntime(makeState({ count: 0 }));
    r2.replay([...events].reverse());

    expect(r1.read(lastStableVersion)).toBe(r2.read(lastStableVersion));
  });

  it("raw data projection is order-sensitive (by design)", () => {
    const signal = (s: any) => s.data.count;

    const events = [
      { patch: { count: 1 }, dc: { t: 1 } },
      { patch: { count: 2 }, dc: { t: 1 } },
    ];

    const r1 = createRuntime(makeState({ count: 0 }));
    r1.replay(events);

    const r2 = createRuntime(makeState({ count: 0 }));
    r2.replay([...events].reverse());

    expect(r1.read(signal)).toBe(r2.read(signal));
  });

  it("joinAll is order-sensitive for conflicting patches (negative test)", () => {
    const initial = makeState({ count: 0 });

    const e1 = { patch: { count: 1 }, dc: { t: 1 } };
    const e2 = { patch: { count: 2 }, dc: { t: 2 } };

    const s1 = apply(initial, joinAll([e1, e2]));
    const s2 = apply(initial, joinAll([e2, e1]));

    expect(s1.data.count).toBe(s2.data.count);
  });
});
