/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import { For, Portal, Show, Switch, renderToString } from "../src";

describe("renderToString security and server behavior", () => {
  it("escapes text and attributes, omits platform/event props, and sanitizes URL attributes", () => {
    const html = renderToString(
      <a
        href={" \nJaVa\tScRiPt:alert(1)"}
        title={'say "<hello>" & goodbye'}
        class={"btn<primary>"}
        style={{ color: "red", "--accent": '"quoted"' }}
        onClick={() => {
          throw new Error("should not serialize");
        }}
        shadowRoot={{ mode: "open" }}
      >
        {'<script>alert("xss")</script>&'}
      </a>,
    );

    expect(html).toContain('href="about:blank"');
    expect(html).toContain('title="say &quot;&lt;hello&gt;&quot; &amp; goodbye"');
    expect(html).toContain('class="btn&lt;primary&gt;"');
    expect(html).toContain('style="color:red;--accent:&quot;quoted&quot;"');
    expect(html).toContain("&lt;script&gt;alert(\"xss\")&lt;/script&gt;&amp;");
    expect(html).not.toContain("onClick");
    expect(html).not.toContain("shadowRoot");
    expect(html).toBe(
      '<a href="about:blank" title="say &quot;&lt;hello&gt;&quot; &amp; goodbye" class="btn&lt;primary&gt;" style="color:red;--accent:&quot;quoted&quot;">&lt;script&gt;alert("xss")&lt;/script&gt;&amp;</a>',
    );
  });

  it("renders textarea values from value/defaultValue instead of children", () => {
    expect(
      renderToString(
        <textarea value={'<hello>&"'} defaultValue="ignored">
          child
        </textarea>,
      ),
    ).toBe("<textarea>&lt;hello&gt;&amp;\"</textarea>");

    expect(
      renderToString(
        <textarea defaultValue={"fallback"}>child</textarea>,
      ),
    ).toBe("<textarea>fallback</textarea>");
  });

  it("serializes DOM nodes, fragments, iterables, and SSR control-flow markers", () => {
    const text = document.createTextNode("<unsafe>");
    const comment = document.createComment("marker");
    const fragment = document.createDocumentFragment();
    fragment.append(text, comment);
    const iterable = new Set(["x", "y"]);

    const html = renderToString(
      <section>
        {fragment}
        {iterable}
        <Show when={true}>{() => <span>show</span>}</Show>
        <Switch
          value={"b"}
          cases={[
            { when: "a", children: "A" },
            { when: "b", children: "B" },
          ]}
        />
        <For each={[1, 2]}>{(item) => <em>{item}</em>}</For>
        <Portal to={document.body}>
          <strong>ignored</strong>
        </Portal>
      </section>,
    );

    expect(html).toContain("&lt;unsafe&gt;<!--marker-->");
    expect(html).toContain("xy");
    expect(html).toContain(
      "<!--reflex-slot-start--><span>show</span><!--reflex-slot-end-->",
    );
    expect(html).toContain("<!--reflex-slot-start-->B<!--reflex-slot-end-->");
    expect(html).toContain(
      "<!--reflex-slot-start--><em>1</em><em>2</em><!--reflex-slot-end-->",
    );
    expect(html).not.toContain("ignored");
  });

  it("adds default SVG and MathML namespaces during server rendering", () => {
    const svg = renderToString(
      <svg viewBox="0 0 10 10">
        <circle cx={5} cy={5} r={4} />
      </svg>,
    );
    const math = renderToString(
      <math display="block">
        <mrow>
          <mi>x</mi>
        </mrow>
      </math>,
    );

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(math).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
  });
});
