// `Link` is also rendered inside <svg>, where `a` resolves to the SVG
// namespace: not every caller of Link is proven to mount it as HTML, so
// nothing compiles. The runtime namespace re-check is covered in bridge.test.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 1;

function Link() {
  return <a href="#target">svg link</a>;
}

function App() {
  return (
    <div id={() => "ns"}>
      <svg>
        <Link />
      </svg>
      <Link />
    </div>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
