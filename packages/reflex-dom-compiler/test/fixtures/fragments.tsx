// Fragments are transparent: their children join the parent region.
export const minCompiled = 2;

export default function App() {
  return (
    <>
      <div>
        <>
          <span>a</span>
          {""}
        </>
        <>{"b"}</>
      </div>
      <p>
        <>{""}</>
      </p>
    </>
  );
}
