import { render } from "@volynets/reflex-dom";
export const minCompiled = 3;

function App() {
  return [
    <table class="explicit"><tbody><tr><td>cell</td><th>heading</th></tr></tbody></table>,
    // The parser inserts tbody, so this region must use native construction.
    <table class="implicit"><tr><td>no implicit DOM wrapper</td></tr></table>,
    // A template's fragment context can preserve a standalone tr.
    <tr><td>standalone</td></tr>,
    <table><caption>caption</caption><colgroup><col /></colgroup><thead><tr><th>head</th></tr></thead><tfoot><tr><td>foot</td></tr></tfoot></table>,
  ];
}

export default (container: Element) => render(<App />, container);
