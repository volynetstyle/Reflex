import { signal } from "@volynets/reflex";

const App = () => {
  const [count, setCount] = signal(2);

  return (
    <div class="app">
      <div class="card">
        <h1>Reflex Counter</h1>

        <p class="value">{count()}</p>

        <div class="buttons">
          <button onClick={() => setCount(prev => prev - 1)}>-</button>
          <button onClick={() => setCount(0)}>reset</button>
          <button onClick={() => setCount(prev => prev + 1)}>+</button>
        </div>
      </div>
    </div>
  );
};

export default App;