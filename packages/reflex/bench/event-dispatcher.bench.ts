import { bench, describe } from "vitest";
import {
  EventSource,
  subscribeEvent,
} from "../src/infra/event";
import { createEventDispatcher } from "../src/policy/event_dispatcher";
import { blackhole } from "./shared";

const EMIT_COUNT = 1024;
const FANOUT_8 = 8;
const FANOUT_64 = 64;
const SOURCE_COUNT = 16;
const NESTED_DEPTH = 128;
const CHURN_COUNT = 512;

type Dispatcher = ReturnType<typeof createEventDispatcher>;

function createSources(count: number): EventSource<number>[] {
  const sources = new Array<EventSource<number>>(count);

  for (let index = 0; index < count; ++index) {
    sources[index] = new EventSource<number>();
  }

  return sources;
}

function subscribeFanout(
  source: EventSource<number>,
  count: number,
  onValue: (value: number, index: number) => void,
): Destructor[] {
  const disposers = new Array<Destructor>(count);

  for (let index = 0; index < count; ++index) {
    disposers[index] = subscribeEvent(source, (value) => {
      onValue(value, index);
    });
  }

  return disposers;
}

function disposeAll(disposers: readonly Destructor[]): void {
  for (let index = disposers.length - 1; index >= 0; --index) {
    disposers[index]!();
  }
}

describe("event dispatcher: delivery hot paths", () => {
  let dispatcher: Dispatcher;
  let source: EventSource<number>;
  let checksum = 0;
  let disposers: Destructor[];

  bench(
    "emit empty source/1024",
    () => {
      for (let index = 0; index < EMIT_COUNT; ++index) {
        dispatcher.emit(source, index);
      }

      blackhole(source.dispatchDepth);
    },
    {
      setup() {
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
      },
    },
  );

  bench(
    "emit one subscriber/1024",
    () => {
      for (let index = 0; index < EMIT_COUNT; ++index) {
        dispatcher.emit(source, index);
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
        disposers = subscribeFanout(source, 1, (value) => {
          checksum = (checksum + value) | 0;
        });
      },
      teardown() {
        disposeAll(disposers);
      },
    },
  );

  bench(
    "emit fanout/8x1024",
    () => {
      for (let index = 0; index < EMIT_COUNT; ++index) {
        dispatcher.emit(source, index);
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
        disposers = subscribeFanout(source, FANOUT_8, (value, listener) => {
          checksum = (checksum + value + listener) | 0;
        });
      },
      teardown() {
        disposeAll(disposers);
      },
    },
  );

  bench(
    "emit fanout/64x1024",
    () => {
      for (let index = 0; index < EMIT_COUNT; ++index) {
        dispatcher.emit(source, index);
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
        disposers = subscribeFanout(source, FANOUT_64, (value, listener) => {
          checksum = (checksum + value + listener) | 0;
        });
      },
      teardown() {
        disposeAll(disposers);
      },
    },
  );
});

describe("event dispatcher: queue behavior", () => {
  let dispatcher: Dispatcher;
  let source: EventSource<number>;
  let sources: EventSource<number>[];
  let checksum = 0;

  bench(
    "nested same-source chain/128",
    () => {
      dispatcher.emit(source, 0);
      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();

        subscribeEvent(source, (value) => {
          checksum = (checksum + value) | 0;

          if (value + 1 < NESTED_DEPTH) {
            dispatcher.emit(source, value + 1);
          }
        });
      },
    },
  );

  bench(
    "nested cross-source round-robin/16x64",
    () => {
      dispatcher.emit(sources[0]!, 0);
      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        sources = createSources(SOURCE_COUNT);

        for (let index = 0; index < SOURCE_COUNT; ++index) {
          const nextSource = sources[(index + 1) % SOURCE_COUNT]!;

          subscribeEvent(sources[index]!, (value) => {
            checksum = (checksum + value + index) | 0;

            if (value + 1 < SOURCE_COUNT * 64) {
              dispatcher.emit(nextSource, value + 1);
            }
          });
        }
      },
    },
  );

  bench(
    "burst across sources/16x1024",
    () => {
      for (let index = 0; index < EMIT_COUNT; ++index) {
        dispatcher.emit(sources[index & (SOURCE_COUNT - 1)]!, index);
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        sources = createSources(SOURCE_COUNT);

        for (let index = 0; index < SOURCE_COUNT; ++index) {
          subscribeEvent(sources[index]!, (value) => {
            checksum = (checksum + value + index) | 0;
          });
        }
      },
    },
  );
});

describe("event dispatcher: subscription churn under delivery", () => {
  let dispatcher: Dispatcher;
  let source: EventSource<number>;
  let checksum = 0;

  bench(
    "subscribe+dispose between emits/512",
    () => {
      for (let index = 0; index < CHURN_COUNT; ++index) {
        const dispose = subscribeEvent(source, (value) => {
          checksum = (checksum + value) | 0;
        });

        dispatcher.emit(source, index);
        dispose();
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
      },
    },
  );

  bench(
    "self-dispose during delivery/512",
    () => {
      for (let index = 0; index < CHURN_COUNT; ++index) {
        let dispose: Destructor = () => {};

        dispose = subscribeEvent(source, (value) => {
          checksum = (checksum + value) | 0;
          dispose();
        });

        dispatcher.emit(source, index);
      }

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        dispatcher = createEventDispatcher();
        source = new EventSource<number>();
      },
    },
  );
});
