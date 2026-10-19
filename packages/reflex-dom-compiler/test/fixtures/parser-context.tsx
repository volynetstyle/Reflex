// Trees the DOM API builds but the HTML parser restructures. Template must
// back off to native; native must equal the runtime.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 6;

function App() {
  return (
    <main id={() => "parser"}>
      <p>
        <div>block inside paragraph</div>
      </p>
      <a href="/outer">
        outer <a href="/inner">inner</a>
      </a>
      <button>
        <button>nested</button>
      </button>
      <h1>
        <h2>heading in heading</h2>
      </h1>
      <li>orphan item</li>
      <img alt="void">{"child of void"}</img>
    </main>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
