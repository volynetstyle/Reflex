import { computed, memo } from "../src/api/derived";
import { effect } from "../src/api/effect";
import { signal } from "../src/api/signal";
import { createRuntime } from "../src/infra/runtime";

export { computed, createRuntime, effect, memo, signal };

export function setup() {
  const rt = createRuntime();

  return {
    rt,
    signal,
    computed,
    memo,
    effect,
  };
}
