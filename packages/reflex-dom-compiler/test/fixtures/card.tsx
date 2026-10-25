// The plan's differential-testing example.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 1;

function App() {
  return (
    <div class="card">
      <span>Hello</span>
      <button disabled>Save</button>
    </div>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
