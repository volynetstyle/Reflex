import { bench, describe } from "vitest";
import { resetRuntimeContext } from "@volynets/reflex-runtime/internal";

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
