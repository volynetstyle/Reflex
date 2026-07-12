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
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
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

const cache = Object.assign(
  Object.create(null),
  attributeAliases,
) as Record<string, string>;

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

  const cached = cache[name];

  if (cached !== undefined) {
    return cached;
  }

  cache[name] = name;
  return name;
}