// Text node boundaries: empty strings, adjacency, numbers, bigint, skipped
// values and characters the HTML parser would reinterpret.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 6;

function App() {
  return (
    <div id={() => "text-edges"}>
      <p>{""}</p>
      <p>{"a"}{""}{"b"}</p>
      <p>{"a"}{"b"}</p>
      <p>{1}{2n}{-0}{3.5}</p>
      <p>{true}{false}{null}{undefined}</p>
      <p>{"<b>&amp;\"quotes\" nbsp"}</p>
      <p>{"cr\r\nlf"}</p>
      <p>{"\n leading newline"}</p>
      <span>{0}</span>
    </div>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
