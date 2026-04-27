import { createModel, memo, signal } from "@volynets/reflex";
import { Button, Sidebar } from "./uikit";

const counter = createModel((ctx, initial: number) => {
  const [count, setCount] = signal(initial);

  return {
    count,
    inc: ctx.action(() => setCount((prev) => prev + 1)),
    dec: ctx.action(() => setCount((prev) => prev - 1)),
    res: ctx.action(() => setCount(initial)),
  };
});

const App = () => {
  const { count, inc, dec, res } = counter(0);

  const doubled = memo(() => count() * 2);

  return (
    <div class="app-layout">
      <Sidebar />
      <div class="app-content">
        <div class="card">
          <h1 class="text-3xl font-bold underline">Reflex Counter</h1>

          <p class="value">
            {count} * 2 = {doubled}
          </p>

          <div class="buttons">
            <Button onClick={dec}>-</Button>
            <Button onClick={res}>reset</Button>
            <Button onClick={inc}>+</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
