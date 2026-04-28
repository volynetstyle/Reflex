import { memo, signal } from "@volynets/reflex";
import { useEffect } from "@volynets/reflex-dom";
import { Button, Sidebar } from "./uikit";
import RuntimeLayer from "./layer/Runtime";

const useCounter = (initial: number) => {
  const [count, setCount] = signal(initial);

  return {
    count,
    inc: () => setCount((prev) => prev + 1),
    dec: () => setCount((prev) => prev - 1),
    res: () => setCount(initial),
  };
};

const Text = ({
  count,
  doubled,
}: {
  count: Accessor<number>;
  doubled: Accessor<number>;
}) => (
  <p class="value">
    {count} * 2 = {doubled}
  </p>
);

const A = () => {
  useEffect(() => {
    console.log("The A was runned");

    return () => {
      console.log("The A was DESTROIED");
    };
  });

  return "You See The A";
};

const B = () => {
  useEffect(() => {
    console.log("The B was runned");

    return () => {
      console.log("The B was DESTROIED");
    };
  });

  return "You See The B";
};

const App = () => {
  const { count, inc, dec, res } = useCounter(0);

  const a = memo(() => count() * 2);
  const b = memo(() => count() * 2);

  const doubled = memo(() => (count() % 2 === 0 ? a() * 2 : b() * 2));

  return (
    <div class="app-layout">
      {/* <Sidebar /> */}
      <div class="app-content">
        <div class="devtools-workspace">
          <div class="card">
            <h1 class="text-3xl font-bold underline">Reflex Counter</h1>

            {count() % 2 === 0 ? <A /> : <B />}

            <Text count={count} doubled={doubled} />

            <div class="buttons">
              <Button onClick={dec}>-</Button>
              <Button onClick={res}>reset</Button>
              <Button onClick={inc}>+</Button>
            </div>
          </div>
          <RuntimeLayer />
        </div>
      </div>
    </div>
  );
};

export default App;
