// The plan's first example: a fully static component.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 1;

function App() {
  return (
    <section class="profile">
      <h2>Profile</h2>
      <p>Welcome</p>
    </section>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
