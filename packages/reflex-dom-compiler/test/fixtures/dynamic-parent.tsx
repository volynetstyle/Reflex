// A dynamic parent and its static children form one ordered native region.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 3;

const label = () => "live";

function App() {
  return (
    <ul id={() => "list"} class="items">
      <li>first</li>
      <li class="second">second</li>
      {label}
      <li>
        <b>third</b> item
      </li>
    </ul>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
