export type CSSPropertyValue = string | number | null | undefined;

/** Camel-cased CSSOM attribute names (`backgroundColor`, `webkitLineClamp`). */
type CSSCamelCaseKey = Exclude<
  {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string
      ? K
      : never;
  }[keyof CSSStyleDeclaration],
  number | "length" | "parentRule" | "cssText"
>;

type KebabCase<
  Source extends string,
  Result extends string = "",
> = Source extends `${infer Head}${infer Tail}`
  ? KebabCase<
      Tail,
      `${Result}${Head extends Lowercase<Head> ? Head : `-${Lowercase<Head>}`}`
    >
  : Result;

/**
 * Dashed CSSOM attribute name for a camel-cased one, following the CSSOM
 * camel-cased / webkit-cased / dashed attribute rules.
 */
type CSSDashedKey<Key extends string> = Key extends "cssFloat"
  ? "float"
  : Key extends `webkit${infer Rest}`
    ? `-webkit${KebabCase<Rest>}`
    : KebabCase<Key>;

/**
 * Typed inline styles.
 *
 * Accepts CSSOM camel-cased names (`backgroundColor`), dashed names
 * (`background-color`, `-webkit-line-clamp`) and custom properties
 * (`--accent`). The server renderer converts camel-cased names to the
 * dashed form, including `cssFloat` and `webkit*`.
 */
export type StyleObject = {
  [K in CSSCamelCaseKey | CSSDashedKey<CSSCamelCaseKey>]?: CSSPropertyValue;
} & {
  [CustomProperty in `--${string}`]?: CSSPropertyValue;
};

/** Inline style text, a typed style object, or no style. */
export type StyleValue = string | StyleObject | null | undefined;
