import { bench, describe } from "vitest";
import { signal, computed } from "../api/reactivity";

describe("Bench Signals", () => {
  bench("propagate cost", () => {
    const nodes = [];

    const [a, setA] = signal(1);

    let prev = a;

    for (let i = 0; i < 2000; i++) {
      const c = computed(() => prev());
      nodes.push(c);
      prev = c;
    }

    for (let i = 0; i < 10000; i++) {
      setA(i);
    }
  });

  bench("fanout 2000", () => {
    const [a, setA] = signal(1);

    const nodes = [];

    for (let i = 0; i < 2000; i++) {
      nodes.push(computed(() => a()));
    }

    for (let i = 0; i < 10000; i++) {
      setA(i);
    }
  });
});
