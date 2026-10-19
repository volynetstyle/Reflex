// The plan's negative corpus: every region here must stay on the runtime.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 0;

const callback = () => {};

function App() {
  return (
    <div id={() => "negative"}>
      <table>
        <tr>
          <td>Hello</td>
        </tr>
      </table>
      <select value="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
      <svg>
        <foreignObject>
          <div>Hello</div>
        </foreignObject>
      </svg>
      <my-element ref={callback} />
      <input value="x" />
      <textarea>text</textarea>
      <a href="javascript:alert(1)">blocked</a>
      <div style="color: red">styled</div>
      <div tabIndex={1}>tab</div>
    </div>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
