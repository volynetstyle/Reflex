import type { MaybeAccessor } from "./core";

/**
 * WAI-ARIA 1.2 / 1.3 states and properties as content attributes.
 *
 * Value types follow the ARIA value categories. For `true/false` states a
 * boolean is serialized as the `"true"`/`"false"` token (unlike other
 * attributes, `false` does not remove an `aria-*` attribute); `null` or
 * `undefined` removes it.
 */

type AriaBoolean = boolean | "true" | "false";
type AriaBooleanOrUndefined = AriaBoolean | "undefined";
type AriaTristate = AriaBoolean | "mixed";
type AriaInteger = number | `${number}`;
type AriaNumber = number | `${number}`;
/** One element ID. */
type AriaIDReference = string;
/** Space-separated element IDs. */
type AriaIDReferenceList = string;

type AriaRelevantToken = "additions" | "all" | "removals" | "text";

/** Value types of every ARIA state and property, keyed by attribute name. */
export interface AriaAttributeValueMap {
  "aria-activedescendant": AriaIDReference;
  "aria-atomic": AriaBoolean;
  "aria-autocomplete": "both" | "inline" | "list" | "none";
  /** ARIA 1.3. */
  "aria-braillelabel": string;
  /** ARIA 1.3. */
  "aria-brailleroledescription": string;
  "aria-busy": AriaBoolean;
  "aria-checked": AriaTristate | "undefined";
  "aria-colcount": AriaInteger;
  "aria-colindex": AriaInteger;
  "aria-colindextext": string;
  "aria-colspan": AriaInteger;
  "aria-controls": AriaIDReferenceList;
  "aria-current": AriaBoolean | "date" | "location" | "page" | "step" | "time";
  "aria-describedby": AriaIDReferenceList;
  "aria-description": string;
  "aria-details": AriaIDReferenceList;
  "aria-disabled": AriaBoolean;
  /** @deprecated Deprecated in ARIA 1.1. */
  "aria-dropeffect": string;
  "aria-errormessage": AriaIDReferenceList;
  "aria-expanded": AriaBooleanOrUndefined;
  "aria-flowto": AriaIDReferenceList;
  /** @deprecated Deprecated in ARIA 1.1. */
  "aria-grabbed": AriaBooleanOrUndefined;
  "aria-haspopup": AriaBoolean | "dialog" | "grid" | "listbox" | "menu" | "tree";
  "aria-hidden": AriaBooleanOrUndefined;
  "aria-invalid": AriaBoolean | "grammar" | "spelling";
  "aria-keyshortcuts": string;
  "aria-label": string;
  "aria-labelledby": AriaIDReferenceList;
  "aria-level": AriaInteger;
  "aria-live": "assertive" | "off" | "polite";
  "aria-modal": AriaBoolean;
  "aria-multiline": AriaBoolean;
  "aria-multiselectable": AriaBoolean;
  "aria-orientation": "horizontal" | "undefined" | "vertical";
  "aria-owns": AriaIDReferenceList;
  "aria-placeholder": string;
  "aria-posinset": AriaInteger;
  "aria-pressed": AriaTristate | "undefined";
  "aria-readonly": AriaBoolean;
  "aria-relevant": AriaRelevantToken | `${AriaRelevantToken} ${string}`;
  "aria-required": AriaBoolean;
  "aria-roledescription": string;
  "aria-rowcount": AriaInteger;
  "aria-rowindex": AriaInteger;
  "aria-rowindextext": string;
  "aria-rowspan": AriaInteger;
  "aria-selected": AriaBooleanOrUndefined;
  "aria-setsize": AriaInteger;
  "aria-sort": "ascending" | "descending" | "none" | "other";
  "aria-valuemax": AriaNumber;
  "aria-valuemin": AriaNumber;
  "aria-valuenow": AriaNumber;
  "aria-valuetext": string;
}

/** ARIA attribute props; each accepts a static value or an accessor. */
export type AriaAttributes = {
  [Name in keyof AriaAttributeValueMap]?: MaybeAccessor<
    AriaAttributeValueMap[Name] | null | undefined
  >;
};

/** Non-abstract WAI-ARIA 1.2 / 1.3 roles. */
type AriaDocumentRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "blockquote"
  | "button"
  | "caption"
  | "cell"
  | "checkbox"
  | "code"
  | "columnheader"
  | "combobox"
  | "comment"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "deletion"
  | "dialog"
  | "directory"
  | "document"
  | "emphasis"
  | "feed"
  | "figure"
  | "form"
  | "generic"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "image"
  | "img"
  | "insertion"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "mark"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "meter"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "paragraph"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "sectionfooter"
  | "sectionheader"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "strong"
  | "subscript"
  | "suggestion"
  | "superscript"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "time"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem";

/** WAI-ARIA Graphics Module roles. */
type AriaGraphicsRole = "graphics-document" | "graphics-object" | "graphics-symbol";

/** DPUB-ARIA 1.1 roles. */
type AriaDigitalPublishingRole =
  | "doc-abstract"
  | "doc-acknowledgments"
  | "doc-afterword"
  | "doc-appendix"
  | "doc-backlink"
  | "doc-biblioentry"
  | "doc-bibliography"
  | "doc-biblioref"
  | "doc-chapter"
  | "doc-colophon"
  | "doc-conclusion"
  | "doc-cover"
  | "doc-credit"
  | "doc-credits"
  | "doc-dedication"
  | "doc-endnote"
  | "doc-endnotes"
  | "doc-epigraph"
  | "doc-epilogue"
  | "doc-errata"
  | "doc-example"
  | "doc-footnote"
  | "doc-foreword"
  | "doc-glossary"
  | "doc-glossref"
  | "doc-index"
  | "doc-introduction"
  | "doc-noteref"
  | "doc-notice"
  | "doc-pagebreak"
  | "doc-pagefooter"
  | "doc-pageheader"
  | "doc-pagelist"
  | "doc-part"
  | "doc-preface"
  | "doc-prologue"
  | "doc-pullquote"
  | "doc-qna"
  | "doc-subtitle"
  | "doc-tip"
  | "doc-toc";

/** A concrete ARIA role token. */
export type AriaRole =
  | AriaDocumentRole
  | AriaGraphicsRole
  | AriaDigitalPublishingRole;

/**
 * Value of the `role` attribute: a role, optionally followed by fallback
 * roles separated by spaces.
 */
export type AriaRoleValue = AriaRole | `${AriaRole} ${string}`;
