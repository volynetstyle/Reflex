// The plan's negative corpus: every region here must stay on the runtime.
export const minCompiled = 0;

const callback = () => {};

export default function App() {
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
