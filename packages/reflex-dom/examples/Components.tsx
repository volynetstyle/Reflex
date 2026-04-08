/** @jsxImportSource reflex-dom */

import { signal } from "@volynets/reflex";
import { render } from "reflex-dom";

const [count, setCount] = signal(0);

function Counter() {
  return (
    <button
      type="button"
      onClick={() => setCount((value) => value + 1)}
    >
      count: {count}
    </button>
  );
}

const root = document.getElementById("app");

if (root) {
  render(<Counter />, root);
}
