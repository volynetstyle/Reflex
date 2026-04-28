import { subtle } from "@volynets/reflex-runtime/debug";
import { useEffectRender, useRef } from "@volynets/reflex-dom";
import {
  createRuntimeCytoscapeController,
  type RuntimeCytoscapeController,
} from "./RuntimeCytoscape";
import { applyGraphEvent, buildGraph } from "./RuntimeGraphModel";
import { RuntimeLayoutComposer } from "./RuntimeLayoutComposer";

const RuntimeLayer = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLOListElement | null>(null);
  const layoutRef = useRef(new RuntimeLayoutComposer());
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffectRender(() => {
    const container = containerRef.current;
    if (container === null) return;

    if (container.clientWidth === 0) container.style.width = "100%";
    if (container.clientHeight === 0) container.style.height = "420px";

    subtle.configure({ historyLimit: 500 });

    const graph = buildGraph(subtle.history());
    let frame = 0;
    let controller: RuntimeCytoscapeController | null =
      createRuntimeCytoscapeController({
        container,
        graph,
        history: historyRef.current,
        layout: layoutRef.current,
        overlay: overlayRef.current,
        summary: summaryRef.current,
      });

    const scheduleRender = () => {
      if (frame !== 0) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        controller?.render();
      });
    };

    const unsubscribe = subtle.observe((event) => {
      applyGraphEvent(graph, event);
      scheduleRender();
      window.setTimeout(() => controller?.highlight(event), 40);
    });

    const resizeObserver = new ResizeObserver(() => {
      controller?.resize();
    });
    resizeObserver.observe(container);
    scheduleRender();

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      layoutRef.current.reset();
      if (frame !== 0) window.cancelAnimationFrame(frame);
      controller?.destroy();
      controller = null;
    };
  });

  return (
    <div class="runtime-panel">
      <section class="runtime-layer" aria-label="Runtime graph">
        <header class="runtime-layer__header">
          <div>
            <h2>Runtime graph</h2>
            <p ref={summaryRef}>0 nodes, 0 edges</p>
          </div>
        </header>
        <div ref={containerRef} class="runtime-layer__graph" />
        <div ref={overlayRef} class="runtime-layer__overlay" />
      </section>
      <aside class="runtime-history" aria-label="Runtime event history">
        <header>
          <h2>History</h2>
          <p>latest events</p>
        </header>
        <ol ref={historyRef} />
      </aside>
    </div>
  );
};

export default RuntimeLayer;
