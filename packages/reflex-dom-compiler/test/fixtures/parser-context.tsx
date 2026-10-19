// Trees the DOM API builds but the HTML parser restructures. Template must
// back off to native; native must equal the runtime.
export const minCompiled = 6;

export default function App() {
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
