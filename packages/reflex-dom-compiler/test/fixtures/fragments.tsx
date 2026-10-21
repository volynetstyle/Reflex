// Fragments are transparent: their children join the parent region.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 2;

function App() {
  return (
    <>
      <div>
        <>
          <span>a</span>
          {""}
        </>
        <>{"b"}</>
      </div>
      <p>
        <>{""}</>
      </p>
    </>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
