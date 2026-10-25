// One dynamic child per region, every kind of value. Text, empty values and
// accessors are mounted at markers; an element or an array as the value makes
// create() decline before building, so those regions mount through fallback().
import { render } from "@volynets/reflex-dom";
export const minCompiled = 12;

const text = "dynamic";
const number = 42;
const nothing = null;
const empty = "";
const accessor = () => "from accessor";
const structural = () => <i>structural accessor</i>;
const element = <b>element value</b>;
const list = ["a", "b"];
const toggled = false as boolean;

function App() {
  return (
    <section id={() => "holes"}>
      <p class="text">hello {text}!</p>
      <p>{number}</p>
      <p>before {nothing} after</p>
      <p>{empty}</p>
      <p>x{empty}y</p>
      <p>bound: {accessor}</p>
      <p>{structural}</p>
      <p>element: {element}</p>
      <p>list: {list}</p>
      <p>{toggled && "never"}</p>
      <div class="deep">
        <span>nested</span>
        <em>{text}</em>
      </div>
      <ul>
        <li>{`template ${text}`}</li>
      </ul>
    </section>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
