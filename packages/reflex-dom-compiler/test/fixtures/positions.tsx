// Consumed positions: returns through conditionals and logical operators,
// arrow bodies. Escaping positions stay on the runtime.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 3;

const flag = true as boolean;
const saved = <div>saved</div>;

function helper() {
  return <div>from helper</div>;
}

const Arrow = () => <em>arrow</em>;

function Wrapper(props: { children?: unknown }) {
  return <section>{props.children as never}</section>;
}

function App() {
  return (
    <div id={() => "positions"}>
      {flag ? <p>yes</p> : <p>no</p>}
      {flag && <b>and</b>}
      {saved}
      {helper()}
      <Arrow />
      <Wrapper>
        <i>passed to a component</i>
      </Wrapper>
    </div>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
