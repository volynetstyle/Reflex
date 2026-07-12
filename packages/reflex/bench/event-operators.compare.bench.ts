import { createEvent as createEffectorEvent, createStore, merge as effectorMerge } from "effector";
import * as most from "most";
import { Subject, merge as rxMerge, switchMap as rxSwitchMap } from "rxjs";
import {
  filter as rxFilter,
  map as rxMap,
  scan as rxScan,
} from "rxjs/operators";
import xsModule from "xstream";
import { bench, describe } from "vitest";
import {
  filter,
  hold,
  map,
  merge,
  scan,
  switchMap,
} from "../src/api/event";
import type { Event, EventSource as ReflexEventSource } from "../src/infra/runtime";
import { createRuntime } from "../src";
import { blackhole } from "./shared";

const EMIT_COUNT = 1024;
const CHAIN_DEPTH = 10;
const SOURCE_COUNT = 16;
const SWITCH_COUNT = 512;

type PushSource<T> = {
  stream: unknown;
  emit(value: T): void;
};

function createMostSource<T>(): PushSource<T> {
  let sink:
    | {
        event(time: number, value: T): void;
      }
    | undefined;
  let scheduler: { now(): number } | undefined;
  const stream = new most.Stream<T>({
    run(nextSink: typeof sink, nextScheduler: typeof scheduler) {
      sink = nextSink;
      scheduler = nextScheduler;

      return {
        dispose() {
          sink = undefined;
          scheduler = undefined;
        },
      };
    },
  });

  return {
    stream,
    emit(value) {
      sink?.event(scheduler?.now() ?? 0, value);
    },
  };
}

function createXstreamSource<T>(): PushSource<T> {
  let listener:
    | {
        next(value: T): void;
      }
    | undefined;
  const xs = "default" in xsModule ? xsModule.default : xsModule;
  const stream = xs.create<T>({
    start(nextListener) {
      listener = nextListener;
    },
    stop() {
      listener = undefined;
    },
  });

  return {
    stream,
    emit(value) {
      listener?.next(value);
    },
  };
}

function createReflexSources(count: number) {
  const rt = createRuntime();
  const sources = new Array<ReturnType<typeof rt.event<number>>>(count);

  for (let index = 0; index < count; ++index) {
    sources[index] = rt.event<number>();
  }

  return sources;
}

describe("event operators: reflex", () => {
  let source: ReflexEventSource<number>;
  let sources: ReturnType<typeof createReflexSources>;
  let checksum = 0;
  let dispose: Destructor;

  bench("map chain 10", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createRuntime().event<number>();
      let current: Event<number> = source;

      for (let depth = 0; depth < CHAIN_DEPTH; ++depth) {
        current = map(current, (value) => value + 1);
      }

      dispose = current.subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      dispose();
    },
  });

  bench("filter pass/drop", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createRuntime().event<number>();
      dispose = filter(source, (value) => (value & 1) === 0).subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      dispose();
    },
  });

  bench("merge 16 sources", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) {
      sources[index & (SOURCE_COUNT - 1)]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = createReflexSources(SOURCE_COUNT);
      dispose = merge(...sources).subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      dispose();
    },
  });

  bench("switchMap replace inner", () => {
    for (let index = 0; index < SWITCH_COUNT; ++index) {
      sources[0]!.emit(index & 1);
      sources[(index & 1) + 1]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = createReflexSources(3);
      dispose = switchMap(sources[0]!, (value) => sources[(value & 1) + 1]!).subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      dispose();
    },
  });

  bench("scan accumulator", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(read());
  }, {
    setup() {
      source = createRuntime().event<number>();
      [read, dispose] = scan(source, 0, (acc, value) => acc + value);
    },
    teardown() {
      dispose();
    },
  });

  let read: Accessor<number>;

  bench("hold latest value", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(read());
  }, {
    setup() {
      source = createRuntime().event<number>();
      [read, dispose] = hold(source, 0);
    },
    teardown() {
      dispose();
    },
  });
});

describe("event operators: rxjs", () => {
  let subject: Subject<number>;
  let subjects: Subject<number>[];
  let subscription: { unsubscribe(): void };
  let checksum = 0;
  let latest = 0;

  bench("map chain 10", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) subject.next(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      subject = new Subject<number>();
      let stream = subject.asObservable();

      for (let depth = 0; depth < CHAIN_DEPTH; ++depth) {
        stream = stream.pipe(rxMap((value) => value + 1));
      }

      subscription = stream.subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("filter pass/drop", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) subject.next(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      subject = new Subject<number>();
      subscription = subject.pipe(rxFilter((value) => (value & 1) === 0)).subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("merge 16 sources", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) {
      subjects[index & (SOURCE_COUNT - 1)]!.next(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      subjects = Array.from({ length: SOURCE_COUNT }, () => new Subject<number>());
      subscription = rxMerge(...subjects).subscribe((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("switchMap replace inner", () => {
    for (let index = 0; index < SWITCH_COUNT; ++index) {
      subjects[0]!.next(index & 1);
      subjects[(index & 1) + 1]!.next(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      subjects = Array.from({ length: 3 }, () => new Subject<number>());
      subscription = subjects[0]!
        .pipe(rxSwitchMap((value) => subjects[(value & 1) + 1]!))
        .subscribe((value) => {
          checksum = (checksum + value) | 0;
        });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("scan accumulator", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) subject.next(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      subject = new Subject<number>();
      subscription = subject.pipe(rxScan((acc, value) => acc + value, 0)).subscribe((value) => {
        latest = value;
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("hold latest value", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) subject.next(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      subject = new Subject<number>();
      subscription = subject.subscribe((value) => {
        latest = value;
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });
});

describe("event operators: most", () => {
  let source: PushSource<number>;
  let sources: PushSource<number>[];
  let subscription: { unsubscribe(): void };
  let checksum = 0;
  let latest = 0;

  bench("map chain 10", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createMostSource<number>();
      let stream = source.stream as most.Stream<number>;

      for (let depth = 0; depth < CHAIN_DEPTH; ++depth) {
        stream = most.map((value) => value + 1, stream);
      }

      subscription = stream.subscribe({
        next(value) {
          checksum = (checksum + value) | 0;
        },
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("filter pass/drop", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createMostSource<number>();
      subscription = most
        .filter((value) => (value & 1) === 0, source.stream as most.Stream<number>)
        .subscribe({
          next(value) {
            checksum = (checksum + value) | 0;
          },
        });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("merge 16 sources", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) {
      sources[index & (SOURCE_COUNT - 1)]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = Array.from({ length: SOURCE_COUNT }, () => createMostSource<number>());
      subscription = most
        .mergeArray(sources.map((item) => item.stream as most.Stream<number>))
        .subscribe({
          next(value) {
            checksum = (checksum + value) | 0;
          },
        });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("switchMap replace inner", () => {
    for (let index = 0; index < SWITCH_COUNT; ++index) {
      sources[0]!.emit(index & 1);
      sources[(index & 1) + 1]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = Array.from({ length: 3 }, () => createMostSource<number>());
      const outer = sources[0]!.stream as most.Stream<number>;
      const stream = most.switchLatest(
        most.map((value) => sources[(value & 1) + 1]!.stream as most.Stream<number>, outer),
      );
      subscription = stream.subscribe({
        next(value) {
          checksum = (checksum + value) | 0;
        },
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("scan accumulator", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      source = createMostSource<number>();
      subscription = most
        .scan((acc, value) => acc + value, 0, source.stream as most.Stream<number>)
        .subscribe({
          next(value) {
            latest = value;
          },
        });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });

  bench("hold latest value", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      source = createMostSource<number>();
      subscription = (source.stream as most.Stream<number>).subscribe({
        next(value) {
          latest = value;
        },
      });
    },
    teardown() {
      subscription.unsubscribe();
    },
  });
});

describe("event operators: xstream", () => {
  const xs = "default" in xsModule ? xsModule.default : xsModule;
  let source: PushSource<number>;
  let sources: PushSource<number>[];
  let stream: InstanceType<typeof xs.Stream>;
  let listener: { next(value: number): void; error(error: unknown): void; complete(): void };
  let checksum = 0;
  let latest = 0;

  function makeListener(onValue: (value: number) => void) {
    return {
      next: onValue,
      error(error: unknown) {
        throw error;
      },
      complete() {},
    };
  }

  bench("map chain 10", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createXstreamSource<number>();
      stream = source.stream as InstanceType<typeof xs.Stream>;

      for (let depth = 0; depth < CHAIN_DEPTH; ++depth) {
        stream = stream.map((value) => value + 1);
      }

      listener = makeListener((value) => {
        checksum = (checksum + value) | 0;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });

  bench("filter pass/drop", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      source = createXstreamSource<number>();
      stream = (source.stream as InstanceType<typeof xs.Stream>).filter(
        (value) => (value & 1) === 0,
      );
      listener = makeListener((value) => {
        checksum = (checksum + value) | 0;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });

  bench("merge 16 sources", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) {
      sources[index & (SOURCE_COUNT - 1)]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = Array.from({ length: SOURCE_COUNT }, () => createXstreamSource<number>());
      stream = xs.merge(...sources.map((item) => item.stream));
      listener = makeListener((value) => {
        checksum = (checksum + value) | 0;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });

  bench("switchMap replace inner", () => {
    for (let index = 0; index < SWITCH_COUNT; ++index) {
      sources[0]!.emit(index & 1);
      sources[(index & 1) + 1]!.emit(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      sources = Array.from({ length: 3 }, () => createXstreamSource<number>());
      stream = (sources[0]!.stream as InstanceType<typeof xs.Stream>)
        .map((value) => sources[(value & 1) + 1]!.stream)
        .flatten();
      listener = makeListener((value) => {
        checksum = (checksum + value) | 0;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });

  bench("scan accumulator", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      source = createXstreamSource<number>();
      stream = (source.stream as InstanceType<typeof xs.Stream>).fold(
        (acc, value) => acc + value,
        0,
      );
      listener = makeListener((value) => {
        latest = value;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });

  bench("hold latest value", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) source.emit(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      source = createXstreamSource<number>();
      stream = (source.stream as InstanceType<typeof xs.Stream>).remember();
      listener = makeListener((value) => {
        latest = value;
      });
      stream.addListener(listener);
    },
    teardown() {
      stream.removeListener(listener);
    },
  });
});

describe("event operators: effector", () => {
  let event: ReturnType<typeof createEffectorEvent<number>>;
  let events: Array<ReturnType<typeof createEffectorEvent<number>>>;
  let unsubscribe: Destructor;
  let checksum = 0;
  let latest = 0;

  bench("map chain 10", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) event(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      event = createEffectorEvent<number>();
      let current = event;

      for (let depth = 0; depth < CHAIN_DEPTH; ++depth) {
        current = current.map((value) => value + 1);
      }

      unsubscribe = current.watch((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      unsubscribe();
    },
  });

  bench("filter pass/drop", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) event(index);
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      event = createEffectorEvent<number>();
      unsubscribe = event.filter({ fn: (value) => (value & 1) === 0 }).watch((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      unsubscribe();
    },
  });

  bench("merge 16 sources", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) {
      events[index & (SOURCE_COUNT - 1)]!(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      events = Array.from({ length: SOURCE_COUNT }, () => createEffectorEvent<number>());
      unsubscribe = effectorMerge(events).watch((value) => {
        checksum = (checksum + value) | 0;
      });
    },
    teardown() {
      unsubscribe();
    },
  });

  bench("switchMap replace inner", () => {
    for (let index = 0; index < SWITCH_COUNT; ++index) {
      events[0]!(index & 1);
      events[(index & 1) + 1]!(index);
    }
    blackhole(checksum);
  }, {
    setup() {
      checksum = 0;
      events = Array.from({ length: 3 }, () => createEffectorEvent<number>());
      let unsubscribeInner: Destructor | undefined;
      const unsubscribeOuter = events[0]!.watch((value) => {
        unsubscribeInner?.();
        unsubscribeInner = events[(value & 1) + 1]!.watch((inner) => {
          checksum = (checksum + inner) | 0;
        });
      });
      unsubscribe = () => {
        unsubscribeInner?.();
        unsubscribeOuter();
      };
    },
    teardown() {
      unsubscribe();
    },
  });

  bench("scan accumulator", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) event(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      event = createEffectorEvent<number>();
      const store = createStore(0).on(event, (acc, value) => acc + value);
      unsubscribe = store.watch((value) => {
        latest = value;
      });
    },
    teardown() {
      unsubscribe();
    },
  });

  bench("hold latest value", () => {
    for (let index = 0; index < EMIT_COUNT; ++index) event(index);
    blackhole(latest);
  }, {
    setup() {
      latest = 0;
      event = createEffectorEvent<number>();
      const store = createStore(0).on(event, (_, value) => value);
      unsubscribe = store.watch((value) => {
        latest = value;
      });
    },
    teardown() {
      unsubscribe();
    },
  });
});
