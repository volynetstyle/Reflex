// Every whitelisted prop form, mounted with and without compilation.
import { render } from "@volynets/reflex-dom";
export const minCompiled = 1;

function App() {
  return (
    <section
      id="attrs"
      className="a b"
      title={'say "<hi>" & bye'}
      lang="en"
      dir="rtl"
      role="region"
      data-count={3}
      data-flag
      data-off={false}
      data-none={null}
      aria-hidden={false}
      aria-label="label"
      aria-level={2}
      hidden
      inert={false}
      key-free={undefined}
    >
      <label htmlFor="field">Label</label>
      <a href="/path?q=1&r=2" target="_blank" rel="noopener" download="file.txt">link</a>
      <img src="/image.png" alt="" loading="lazy" decoding="async" crossOrigin="anonymous" />
      <button type="button" name="go" disabled>Go</button>
      <time datetime="2026-10-19">today</time>
      <span class={7} slot="s">numbers</span>
    </section>
  );
}

// The renderer is provably the only caller of App.
export default (container: Element) => render(<App />, container);
