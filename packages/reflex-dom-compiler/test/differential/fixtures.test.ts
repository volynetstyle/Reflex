import { describe, it } from "vitest";
import { checkFixture, fixtureNames } from "./fixtures.shared";

describe("differential fixtures (jsdom)", () => {
  it.each(fixtureNames)("%s: every variant mounts the baseline DOM", (name) => {
    checkFixture(name);
  });

  it.each(fixtureNames)("%s: equivalent in a detached HTML document", (name) => {
    checkFixture(name, document.implementation.createHTMLDocument("detached"));
  });
});
