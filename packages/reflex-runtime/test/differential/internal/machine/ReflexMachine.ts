import type { RuntimePort } from "./RuntimeMachine";
import { RuntimeMachine } from "./RuntimeMachine";
import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../../../src";

import type { Value } from "../../api";

type ReflexProducer = ReturnType<typeof createProducer<Value>>;
type ReflexComputed = ReturnType<typeof createConsumer<Value>>;
type ReflexWatcher = ReturnType<typeof createWatcher>;

export class ReflexMachine extends RuntimeMachine<
  ReflexProducer,
  ReflexComputed,
  ReflexWatcher
> {
  constructor() {
    super({
      createProducer,
      createComputed: createConsumer,
      createWatcher,

      readProducer,
      writeProducer,
      readComputed: readConsumer,

      runWatcher,
      disposeWatcher,
    } satisfies RuntimePort<ReflexProducer, ReflexComputed, ReflexWatcher>);
  }
}
