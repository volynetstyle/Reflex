// 17 nodes: a typical static card.
export default function App() {
  return (
    <div class="card" data-kind="static">
      <header class="card-header">
        <h3>Card title</h3>
        <span class="badge" aria-label="status">new</span>
      </header>
      <p class="card-body">Some descriptive text for the card body.</p>
      <ul class="tags">
        <li>alpha</li>
        <li>beta</li>
      </ul>
      <footer>
        <button type="button" disabled>Save</button>
        <a href="/more">More</a>
      </footer>
    </div>
  );
}
