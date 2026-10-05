import {
  For,
  Show,
  createDOMRenderer,
  renderToString,
  useSignal,
  type DOMRangeHandle,
  type JSXRenderable,
} from "@volynets/reflex-dom";
import type { JSX as ProductionJSX } from "@volynets/reflex-dom/jsx-runtime";
import type { JSX as DevelopmentJSX } from "@volynets/reflex-dom/jsx-dev-runtime";

function Counter() {
  const count = useSignal(0);
  return (
    <button
      type="button"
      onClick={(event) => {
        const button: HTMLButtonElement = event.currentTarget;
        button.disabled = true;
        count((value) => value + 1);
      }}
    >
      {count}
    </button>
  );
}

const ref = { current: null as DOMRangeHandle | null };
const view: ProductionJSX.Element = (
  <>
    <Counter />
    <Show when={true} ref={ref}>
      <span>Visible</span>
    </Show>
    <For each={[1, 2]} by={(value) => value}>
      {(value) => <span>{value}</span>}
    </For>
    <svg>
      <circle cx={1} />
    </svg>
  </>
);
const development: DevelopmentJSX.Element = view;
const renderable: JSXRenderable = development;
createDOMRenderer().render(renderable, document.createElement("main"));
renderToString(renderable);

// @ts-expect-error Unknown intrinsic tags must not silently lose JSX checking.
<unknownReflexTag />;
// @ts-expect-error Element refs cannot receive a structural range.
<Show when={true} ref={{ current: null as HTMLDivElement | null }} />;
