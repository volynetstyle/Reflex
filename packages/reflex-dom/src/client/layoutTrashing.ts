const sharedLayoutMethods = [
  "getClientRects",
  "getBoundingClientRect",
] as const;

const overflowScrollMethods = [
  "scrollBy",
  "scrollTo",
  "scrollIntoView",
  "scrollIntoViewIfNeeded",
] as const;

const layoutTrashing = {
  Element: {
    props: [
      "clientLeft",
      "clientTop",
      "clientWidth",
      "clientHeight",
      "scrollWidth",
      "scrollHeight",
      "scrollLeft",
      "scrollTop",
      "textContent",
    ] as const,
    methods: [...sharedLayoutMethods, ...overflowScrollMethods],
  },

  HTMLElement: {
    props: [
      "offsetLeft",
      "offsetTop",
      "offsetWidth",
      "offsetHeight",
      "offsetParent",
      "compiledRole", // исправлено: computedRole?
      "compiledName", // исправлено: computedName?
      "innerText",
      "textContent",
      // DOM layout-influencing properties
      "style",
      "classList",
      "dataset",
    ] as const,
    methods: ["focus"] as const,
  },

  window: {
    props: [
      "scrollX",
      "scrollY",
      "pageXOffset",
      "pageYOffset",
      "innerWidth",
      "innerHeight",
      "visualViewport",
    ] as const,
    methods: ["getComputedStyle"] as const,
  },

  VisualViewport: {
    props: [
      "width",
      "height",
      "offsetLeft",
      "offsetTop",
      "pageLeft",
      "pageTop",
    ] as const,
  },

  Document: {
    props: ["scrollingElement"] as const,
    methods: ["elementFromPoint"] as const,
  },

  HTMLInputElement: {
    methods: ["select", "focus"] as const,
  },

  MouseEvent: {
    props: [
      "offsetX",
      "offsetY",
      "layerX",
      "layerY",
      "clientX",
      "clientY",
      "pageX",
      "pageY",
    ] as const,
  },

  Range: {
    methods: [...sharedLayoutMethods] as const,
  },
} as const;

function getLayoutProps<T extends keyof typeof layoutTrashing>(
  target: T
): readonly string[] {
  const obj = layoutTrashing[target];

  return "props" in obj ? (obj.props as readonly string[]) : [];
}
