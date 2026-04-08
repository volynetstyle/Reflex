const HTML_ATTRIBUTE_ALIASES = {
  acceptCharset: "accept-charset",
  className: "class",
  crossOrigin: "crossorigin",
  htmlFor: "for",
  httpEquiv: "http-equiv",
} as const;

const SVG_ATTRIBUTE_ALIASES = {
  accentHeight: "accent-height",
  alignmentBaseline: "alignment-baseline",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  gradientTransform: "gradientTransform",
  gradientUnits: "gradientUnits",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  pathLength: "pathLength",
  patternContentUnits: "patternContentUnits",
  patternUnits: "patternUnits",
  preserveAspectRatio: "preserveAspectRatio",
  spreadMethod: "spreadMethod",
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
  transformOrigin: "transform-origin",
  vectorEffect: "vector-effect",
  viewBox: "viewBox",
  xlinkHref: "xlink:href",
  xmlnsXlink: "xmlns:xlink",
} as const;

export const attributeAliases = {
  ...HTML_ATTRIBUTE_ALIASES,
  ...SVG_ATTRIBUTE_ALIASES,
} as const;

export function normalizeAttr(name: string): string {
  return attributeAliases[name as keyof typeof attributeAliases] ?? name;
}
