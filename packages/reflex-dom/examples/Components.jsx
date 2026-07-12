import {
  createApp,
  For,
  Show,
  useComputed,
  useEffect,
  useMount,
  useSignal,
  useUnmount,
} from "../src/index";

type Todo = {
  id: number;
  text: string;
};

function Counter() {
  const count = useSignal(0);

  const doubled = useComputed(() => count() * 2);

  useMount(() => {
    console.log("Counter mounted");
  });

  useUnmount(() => {
    console.log("Counter unmounted");
  });

  useEffect(() => {
    console.log("Count changed:", count());
  });

  return (
    <section class="counter">
      <h2>Counter</h2>

      <p>
        Count: <strong>{count}</strong>
      </p>

      <p>
        Doubled: <strong>{doubled}</strong>
      </p>

      <div class="actions">
        <button onClick={() => count((value) => value - 1)}>Decrement</button>

        <button onClick={() => count(0)}>Reset</button>

        <button onClick={() => count((value) => value + 1)}>Increment</button>
      </div>

      <Show
        when={() => count() >= 5}
        fallback={<small>Reach 5 to unlock the message</small>}
      >
        <strong>Threshold reached 🎉</strong>
      </Show>
    </section>
  );
}

function TodoList() {
  const todos = useSignal<Todo[]>([
    { id: 1, text: "Implement reactive runtime" },
    { id: 2, text: "Build DOM renderer" },
  ]);

  const addTodo = () => {
    const id = Date.now();

    todos((current) => [
      ...current,
      {
        id,
        text: `Task ${current.length + 1}`,
      },
    ]);
  };

  const removeTodo = (id: number) => {
    todos((current) => current.filter((todo) => todo.id !== id));
  };

  return (
    <section>
      <h2>Tasks</h2>

      <button onClick={addTodo}>Add task</button>

      <ul>
        <For each={todos}>
          {(todo) => (
            <li>
              <span>{todo.text}</span>

              <button onClick={() => removeTodo(todo.id)}>Remove</button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

function App() {
  return (
    <main>
      <h1>Reflex DOM example</h1>

      <Counter />
      <TodoList />
    </main>
  );
}

createApp(App).mount(document.getElementById("app")!);
