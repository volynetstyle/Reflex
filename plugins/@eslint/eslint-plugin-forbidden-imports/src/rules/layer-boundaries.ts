import type { Rule } from "eslint";
import type { ImportDeclaration } from "estree";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce Reflex layer boundaries",
      recommended: true,
    },
    messages: {
      boundary: "Illegal import from '{{to}}' in layer '{{from}}'.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename;

    const isApp = filename.includes("/apps/");
    const isPublicPkg = filename.includes("/packages/reflex");
    const isInternal = filename.includes("/packages/@reflex/");

    return {
      ImportDeclaration(node) {
        const source = (node as ImportDeclaration).source.value;
        if (typeof source !== "string") return;

        // apps can only import reflex / reflex-dom
        if (isApp && source.startsWith("@reflex/")) {
          context.report({
            node,
            messageId: "boundary",
            data: { from: "app", to: source },
          });
        }

        // public package can't import internal (except types maybe later)
        if (isPublicPkg && source.startsWith("@reflex/")) {
          context.report({
            node,
            messageId: "boundary",
            data: { from: "reflex", to: source },
          });
        }

        // internal can do anything
        if (isInternal) return;
      },
    };
  },
};

export default rule;
