import { EventEmitter } from "node:events";
import EventEmitter3 from "eventemitter3";
import mitt from "mitt";
import { createNanoEvents } from "nanoevents";
import { bench, describe } from "vitest";
import {
  EventSource,
  subscribeEvent,
} from "../src/infra/event";
import { createEventDispatcher } from "../src/policy/event_dispatcher";
import { blackhole } from "./shared";

const EVENT_NAME = "value";
const EMIT_COUNT = 1024;
const SUBSCRIBE_CHURN_COUNT = 512;
const NESTED_DEPTH = 128;
const FANOUT = [0, 1, 8, 64] as const;

type RawEmitter = {
  emit(value: number): void;
  on(fn: (value: number) => void): Destructor;
};

type RawEmitterFactory = {
  readonly label: string;
  create(): RawEmitter;
};

const factories: readonly RawEmitterFactory[] = [
  {
    label: "mitt",
    create() {
      const emitter = mitt<Record<typeof EVENT_NAME, number>>();

      return {
        emit(value) {
          emitter.emit(EVENT_NAME, value);
        },
        on(fn) {
          emitter.on(EVENT_NAME, fn);
          return () => emitter.off(EVENT_NAME, fn);
        },
      };
    },
  },
  {
    label: "nanoevents",
    create() {
      const emitter = createNanoEvents<{
        [EVENT_NAME]: (value: number) => void;
      }>();

      return {
        emit(value) {
          emitter.emit(EVENT_NAME, value);
        },
        on(fn) {
          return emitter.on(EVENT_NAME, fn);
        },
      };
    },
  },
  {
    label: "eventemitter3",
    create() {
      const emitter = new EventEmitter3<typeof EVENT_NAME, number>();

      return {
        emit(value) {
          emitter.emit(EVENT_NAME, value);
        },
        on(fn) {
          emitter.on(EVENT_NAME, fn);
          return () => emitter.off(EVENT_NAME, fn);
        },
      };
    },
  },
  {
    label: "node EventEmitter",
    create() {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(0);

      return {
        emit(value) {
          emitter.emit(EVENT_NAME, value);
        },
        on(fn) {
          emitter.on(EVENT_NAME, fn);
          return () => emitter.off(EVENT_NAME, fn);
        },
      };
    },
  },
  {
    label: "reflex EventSource",
    create() {
      const dispatcher = createEventDispatcher();
      const source = new EventSource<number>();

      return {
        emit(value) {
          dispatcher.emit(source, value);
        },
        on(fn) {
          return subscribeEvent(source, fn);
        },
      };
    },
  },
];

function subscribeMany(
  emitter: RawEmitter,
  count: number,
  onValue: (value: number, listener: number) => void,
): Destructor[] {
  const disposers = new Array<Destructor>(count);

  for (let listener = 0; listener < count; ++listener) {
    disposers[listener] = emitter.on((value) => {
      onValue(value, listener);
    });
  }

  return disposers;
}

function disposeAll(disposers: readonly Destructor[]): void {
  for (let index = disposers.length - 1; index >= 0; --index) {
    disposers[index]!();
  }
}

for (const factory of factories) {
  describe(`raw event delivery: ${factory.label}`, () => {
    let emitter: RawEmitter;
    let disposers: Destructor[];
    let checksum = 0;

    for (const fanout of FANOUT) {
      bench(
        `emit ${fanout} subscribers/${EMIT_COUNT}`,
        () => {
          for (let index = 0; index < EMIT_COUNT; ++index) {
            emitter.emit(index);
          }

          blackhole(checksum);
        },
        {
          setup() {
            checksum = 0;
            emitter = factory.create();
            disposers = subscribeMany(emitter, fanout, (value, listener) => {
              checksum = (checksum + value + listener) | 0;
            });
          },
          teardown() {
            disposeAll(disposers);
          },
        },
      );
    }

    bench(
      `subscribe + unsubscribe/${SUBSCRIBE_CHURN_COUNT}`,
      () => {
        for (let index = 0; index < SUBSCRIBE_CHURN_COUNT; ++index) {
          const dispose = emitter.on((value) => {
            checksum = (checksum + value) | 0;
          });

          dispose();
        }

        blackhole(checksum);
      },
      {
        setup() {
          checksum = 0;
          emitter = factory.create();
        },
      },
    );

    bench(
      `self unsubscribe during emit/${SUBSCRIBE_CHURN_COUNT}`,
      () => {
        for (let index = 0; index < SUBSCRIBE_CHURN_COUNT; ++index) {
          let dispose: Destructor = () => {};

          dispose = emitter.on((value) => {
            checksum = (checksum + value) | 0;
            dispose();
          });

          emitter.emit(index);
        }

        blackhole(checksum);
      },
      {
        setup() {
          checksum = 0;
          emitter = factory.create();
        },
      },
    );

    bench(
      `nested emit/${NESTED_DEPTH}`,
      () => {
        emitter.emit(0);
        blackhole(checksum);
      },
      {
        setup() {
          checksum = 0;
          emitter = factory.create();
          emitter.on((value) => {
            checksum = (checksum + value) | 0;

            if (value + 1 < NESTED_DEPTH) {
              emitter.emit(value + 1);
            }
          });
        },
      },
    );
  });
}
