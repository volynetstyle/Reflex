// A larger static region, above the template threshold of `auto`.
export const minCompiled = 1;

export default function App() {
  return (
    <article class="post">
      <header>
        <h1>Title</h1>
        <p class="meta">
          by <a href="/author">Author</a> on <time datetime="2026-01-01">Jan 1</time>
        </p>
      </header>
      <section>
        <p>First paragraph with <em>emphasis</em> and <strong>strong</strong> text.</p>
        <ul>
          <li>one</li>
          <li>two</li>
          <li>three</li>
        </ul>
        <blockquote>
          <p>Quoted</p>
        </blockquote>
      </section>
      <footer>
        <small>footer</small>
        <hr />
        <nav>
          <a href="/prev">prev</a> | <a href="/next">next</a>
        </nav>
      </footer>
    </article>
  );
}
