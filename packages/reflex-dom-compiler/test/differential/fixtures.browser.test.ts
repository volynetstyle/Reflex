import { describe, it } from "vitest";
import { checkFixture, fixtureNames } from "./fixtures.shared";

describe("differential fixtures (browser)", () => {
  it.each(fixtureNames)("%s: every variant mounts the baseline DOM", (name) => {
    checkFixture(name);
  });

  it.each(fixtureNames)("%s: equivalent in an iframe document", (name) => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    try {
      checkFixture(name, frame.contentDocument!);
    } finally {
      frame.remove();
    }
  });
});
