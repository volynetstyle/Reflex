import type { Rule } from "eslint";
import type { ImportDeclaration } from "estree";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct imports from @reflex/*",
      recommended: true,
    },
    messages: {
      forbidden:
        "Do not import from {{name}}. Use 'reflex' or 'reflex-dom' instead.",
    },
    schema: [],
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        const source = (node as ImportDeclaration).source.value;

        if (typeof source !== "string") return;

        // allow inside @reflex packages themselves
        const filename = context.filename;
        if (filename.includes("/packages/@reflex/")) return;

        if (source.startsWith("@reflex/")) {
          context.report({
            node,
            messageId: "forbidden",
            data: { name: source },
          });
        }
      },
    };
  },
};

export default rule;
