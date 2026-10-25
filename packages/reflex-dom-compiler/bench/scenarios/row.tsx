// 10 nodes + 1 dynamic text: a list row whose label is the item, bound
// through the accessor For passes to its callback.
// One For row per instance: For mounts what its callback returns, which is
// the compiler's proof that the region is consumed.
import { For, render } from "@volynets/reflex-dom";

export default (container: Element, keys: readonly number[]) =>
  render(
    <For each={keys} by={(key) => key}>
      {(item) => (
        <div class="row">
          <span class="badge">#</span>
          <span class="label">{item}</span>
          <div class="actions">
            <a href="#open">open</a> <a href="#remove">remove</a>
          </div>
        </div>
      )}
    </For>,
    container,
  );
