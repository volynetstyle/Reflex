// 18 nodes: a typical static card.
// One For row per instance: For mounts what its callback returns, which is
// the compiler's proof that the region is consumed.
import { For, render } from "@volynets/reflex-dom";

export default (container: Element, keys: readonly number[]) =>
  render(
    <For each={keys} by={(key) => key}>
      {() => (
        <div class="card" data-kind="static">
          <header class="card-header">
            <h3>Card title</h3>
            <span class="badge" aria-label="status">new</span>
          </header>
          <p class="card-body">Some descriptive text for the card body.</p>
          <ul class="tags">
            <li>alpha</li>
            <li>beta</li>
          </ul>
          <footer>
            <button type="button" disabled>Save</button>
            <a href="/more">More</a>
          </footer>
        </div>
      )}
    </For>,
    container,
  );
