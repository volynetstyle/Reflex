// 2 nodes: below any plausible template threshold.
// One For row per instance: For mounts what its callback returns, which is
// the compiler's proof that the region is consumed.
import { For, render } from "@volynets/reflex-dom";

export default (container: Element, keys: readonly number[]) =>
  render(
    <For each={keys} by={(key) => key}>
      {() => (
        <p class="note">Saved</p>
      )}
    </For>,
    container,
  );
