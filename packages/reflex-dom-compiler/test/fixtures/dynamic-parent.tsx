// A dynamic parent stays on the runtime; its static children compile.
export const minCompiled = 3;

const label = () => "live";

export default function App() {
  return (
    <ul id={() => "list"} class="items">
      <li>first</li>
      <li class="second">second</li>
      {label}
      <li>
        <b>third</b> item
      </li>
    </ul>
  );
}
