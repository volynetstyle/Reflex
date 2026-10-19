// A compiled HTML region mounted inside <svg> must take the runtime path:
// `a` resolves to the SVG namespace there.
export const minCompiled = 1;

function Link() {
  return <a href="#target">svg link</a>;
}

export default function App() {
  return (
    <div id={() => "ns"}>
      <svg>
        <Link />
      </svg>
      <Link />
    </div>
  );
}
