import { bench, describe } from "vitest";
import { resetRuntimeContext } from "@volynets/reflex-runtime/internal";

import { effect } from "../src/api/effect";
import { signal } from "../src/api/signal";
import { createRuntime, type Runtime } from "../src/infra/runtime";
import { blackhole } from "./shared";

const OPERATIONS = 1_024;

type Setter = (value: number) => void;

function registerStandaloneWrites(strategy: "flush" | "eager" | "sab"): void {
  let setValue: Setter;
  let next = 0;

  bench(
    `standalone signal writes | ${strategy}`,
    () => {
      for (let index = 0; index < OPERATIONS; index++) {
        setValue(++next);
      }

      blackhole(next);
    },
    {
      setup() {
        resetRuntimeContext();
        createRuntime({ effectStrategy: strategy });
        const value = signal(0);
        setValue = value.set;
        next = 0;
      },
    },
  );
}

describe("runtime boundaries", () => {
  let signalSeed = 0;

  bench(
    "signal creation | callable accessor",
    () => {
      let source = signal(0);
      for (let index = 1; index < OPERATIONS; index++) {
        source = signal(++signalSeed);
      }
      blackhole(source());
    },
    {
      setup() {
        resetRuntimeContext();
        createRuntime();
        signalSeed = 0;
      },
    },
  );

  registerStandaloneWrites("flush");
  registerStandaloneWrites("eager");
  registerStandaloneWrites("sab");

  let runtime: Runtime;
  const noop = (): void => {};

  bench(
    "runtime.batch | local no-op",
    () => {
      for (let index = 0; index < OPERATIONS; index++) runtime.batch(noop);
    },
    {
      setup() {
        resetRuntimeContext();
        runtime = createRuntime();
      },
    },
  );

  bench(
    "runtime.batch | nested no-op",
    () => {
      runtime.batch(() => {
        for (let index = 0; index < OPERATIONS; index++) runtime.batch(noop);
      });
    },
    {
      setup() {
        resetRuntimeContext();
        runtime = createRuntime();
      },
    },
  );

  bench(
    "runtime.batch | foreign context",
    () => {
      for (let index = 0; index < OPERATIONS; index++) runtime.batch(noop);
    },
    {
      setup() {
        resetRuntimeContext();
        runtime = createRuntime();
        createRuntime();
      },
    },
  );
});

// Keep empty drains and a single watcher separate from graph traversal costs.
// These cases exercise the public facade and its connected scheduler together.
for (const strategy of ["flush", "eager", "sab"] as const) {
  describe(`connected scheduler boundary | ${strategy}`, () => {
    let runtime: Runtime;
    bench(
      "empty flush / 1024",
      () => {
        for (let index = 0; index < OPERATIONS; ++index) runtime.flush();
      },
      {
        setup() {
          resetRuntimeContext();
          runtime = createRuntime({ effectStrategy: strategy });
        },
      },
    );

    let setValue: Setter;
    let next = 0;
    let seen = 0;
    let stop: () => void;
    bench(
      "single watcher write+flush / 1024",
      () => {
        for (let index = 0; index < OPERATIONS; ++index) {
          setValue(++next);
          runtime.flush();
        }
        blackhole(seen);
      },
      {
        setup() {
          resetRuntimeContext();
          runtime = createRuntime({ effectStrategy: strategy });
          const value = signal(0);
          setValue = value.set;
          next = seen = 0;
          stop = effect(() => {
            seen = value();
          });
        },
        teardown() {
          stop();
        },
      },
    );
  });
}
