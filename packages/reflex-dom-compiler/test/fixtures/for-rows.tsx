// For rows: the callback's result is mounted by reflex-dom's For, so static
// rows compile; rows with a dynamic part keep static children compiled.
import { For, render } from "@volynets/reflex-dom";
export const minCompiled = 3;

const items = ["a", "b", "c"];

function App() {
  return (
    <ul class="rows">
      <For each={items} by={(item) => item} fallback={<li class="empty">empty</li>}>
        {(item) => (
          <li class="row">
            <span class="label">static</span>
            {item}
          </li>
        )}
      </For>
      <For each={items} by={(item) => item}>
        {() => <li class="static-row">same</li>}
      </For>
    </ul>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
