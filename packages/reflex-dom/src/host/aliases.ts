const HTML_ATTRIBUTE_ALIASES = {
  acceptCharset: "accept-charset",
  className: "class",
  crossOrigin: "crossorigin",
  htmlFor: "for",
  httpEquiv: "http-equiv",
} as const;

const SVG_ATTRIBUTE_ALIASES = {
  // Presentation attributes (and `accent-height`): dashed in SVG, camelCase
  // like their CSS properties.
  accentHeight: "accent-height",
  alignmentBaseline: "alignment-baseline",
  baselineShift: "baseline-shift",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  colorRendering: "color-rendering",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontSizeAdjust: "font-size-adjust",
  fontStretch: "font-stretch",
  fontStyle: "font-style",
  fontVariant: "font-variant",
  fontWeight: "font-weight",
  glyphOrientationHorizontal: "glyph-orientation-horizontal",
  glyphOrientationVertical: "glyph-orientation-vertical",
  imageRendering: "image-rendering",
  letterSpacing: "letter-spacing",
  lightingColor: "lighting-color",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  maskType: "mask-type",
  paintOrder: "paint-order",
  pointerEvents: "pointer-events",
  shapeRendering: "shape-rendering",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  textOverflow: "text-overflow",
  textRendering: "text-rendering",
  transformOrigin: "transform-origin",
  unicodeBidi: "unicode-bidi",
  vectorEffect: "vector-effect",
  whiteSpace: "white-space",
  wordSpacing: "word-spacing",
  writingMode: "writing-mode",

  // SVG attributes that are already camelCase in the actual SVG spec.
  // These are kept mostly for explicitness / React-like compatibility.
  gradientTransform: "gradientTransform",
  gradientUnits: "gradientUnits",
  pathLength: "pathLength",
  patternContentUnits: "patternContentUnits",
  patternUnits: "patternUnits",
  preserveAspectRatio: "preserveAspectRatio",
  spreadMethod: "spreadMethod",
  viewBox: "viewBox",

  xlinkHref: "xlink:href",
  xmlnsXlink: "xmlns:xlink",
} as const;

export const attributeAliases = {
  ...HTML_ATTRIBUTE_ALIASES,
  ...SVG_ATTRIBUTE_ALIASES,
} as const;

const aliases = Object.assign(Object.create(null), attributeAliases) as Record<
  string,
  string
>;

export function normalizeAttr(name: string): string {
  switch (name) {
    case "class":
    case "className":
      return "class";
    case "for":
    case "htmlFor":
      return "for";
    case "accept-charset":
    case "acceptCharset":
      return "accept-charset";
    case "http-equiv":
    case "httpEquiv":
      return "http-equiv";
    case "crossorigin":
    case "crossOrigin":
      return "crossorigin";
  }
  // Keep arbitrary data-* and custom attribute names out of the alias table.
  return aliases[name] ?? name;
}
