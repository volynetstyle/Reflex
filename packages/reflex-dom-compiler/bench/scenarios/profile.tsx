// 5 nodes: the plan's first example.
// One For row per instance: For mounts what its callback returns, which is
// the compiler's proof that the region is consumed.
import { For, render } from "@volynets/reflex-dom";

export default (container: Element, keys: readonly number[]) =>
  render(
    <For each={keys} by={(key) => key}>
      {() => (
        <section class="profile">
          <h2>Profile</h2>
          <p>Welcome</p>
        </section>
      )}
    </For>,
    container,
  );
