type LayoutCategory = "read" | "write" | "mixed";

interface LayoutProperty {
  category: LayoutCategory;
  description?: string;
  riskLevel: "high" | "medium" | "low";
  alternative?: string;
}

const layoutThrashingDatabase = {
  reads: {
    Element: {
      clientLeft: {
        category: "read" as const,
        riskLevel: "high",
        description:
          "The width of the left border of the element (including scrollbar)",
      },
      clientTop: {
        category: "read" as const,
        riskLevel: "high",
        description: "The height of the top border of the element",
      },
      clientWidth: {
        category: "read" as const,
        riskLevel: "high",
        description: "The width of the element's content area",
      },
      clientHeight: {
        category: "read" as const,
        riskLevel: "high",
        description: "The height of the element's content area",
      },
      scrollWidth: {
        category: "read" as const,
        riskLevel: "high",
        description: "The total width of the scrollable content",
      },
      scrollHeight: {
        category: "read" as const,
        riskLevel: "high",
        description: "The total height of the scrollable content",
      },
      scrollLeft: {
        category: "read" as const,
        riskLevel: "high",
        description: "The horizontal scroll position",
      },
      scrollTop: {
        category: "read" as const,
        riskLevel: "high",
        description: "The vertical scroll position",
      },
    },
  },

  writes: {
    Element: {
      scrollLeft: {
        category: "write" as const,
        riskLevel: "high",
        description: "Sets the horizontal scroll position",
        alternative: "scrollTo(), scrollBy()",
      },
      scrollTop: {
        category: "write" as const,
        riskLevel: "high",
        description: "Sets the vertical scroll position",
        alternative: "scrollTo(), scrollBy()",
      },
      textContent: {
        category: "write" as const,
        riskLevel: "high",
        description: "Changes the text content of the element",
        alternative: "innerText, createTextNode()",
      },
    },
  },

  methods: {
    Element: {
      getClientRects: {
        category: "read" as const,
        riskLevel: "high",
        description: "Gets the coordinates of all boxes of the element",
      },
      getBoundingClientRect: {
        category: "read" as const,
        riskLevel: "high",
        description: "Gets the coordinates of the element",
      },
      scrollBy: {
        category: "write" as const,
        riskLevel: "high",
        description: "Scrolls by a specified amount",
      },
      scrollTo: {
        category: "write" as const,
        riskLevel: "high",
        description: "Scrolls to a specified position",
      },
      scrollIntoView: {
        category: "write" as const,
        riskLevel: "high",
        description: "Scrolls the element into view",
        alternative: "requestAnimationFrame",
      },
      scrollIntoViewIfNeeded: {
        category: "write" as const,
        riskLevel: "high",
        description: "Conditionally scrolls the element into view",
        alternative: "requestAnimationFrame",
      },
    },
  },
} as const;

/**
 * Check if an operation is potentially problematic
 */
function isLayoutThrashing(
  target: string,
  property: string,
  type: "read" | "write" | "method" = "read"
): boolean {
  const db = layoutThrashingDatabase;

  if (type === "read" && "reads" in db) {
    return property in (db.reads[target as keyof typeof db.reads] || {});
  }

  if (type === "write" && "writes" in db) {
    return property in (db.writes[target as keyof typeof db.writes] || {});
  }

  if (type === "method" && "methods" in db) {
    return property in (db.methods[target as keyof typeof db.methods] || {});
  }

  return false;
}

/**
 * Get the risk level of an operation
 */
function getRiskLevel(
  target: string,
  property: string
): "high" | "medium" | "low" | null {
  const reads = layoutThrashingDatabase.reads as any;
  const writes = layoutThrashingDatabase.writes as any;
  const methods = layoutThrashingDatabase.methods as any;

  if (reads[target]?.[property]) return reads[target][property].riskLevel;
  if (writes[target]?.[property]) return writes[target][property].riskLevel;
  if (methods[target]?.[property]) return methods[target][property].riskLevel;

  return null;
}

/**
 * Get description and alternative for an operation
 */
function getOperationInfo(target: string, property: string) {
  const reads = layoutThrashingDatabase.reads as any;
  const writes = layoutThrashingDatabase.writes as any;
  const methods = layoutThrashingDatabase.methods as any;

  return (
    reads[target]?.[property] ||
    writes[target]?.[property] ||
    methods[target]?.[property] ||
    null
  );
}

/**
 * Get all high-risk operations
 */
function getHighRiskOperations() {
  const result: Record<string, string[]> = {};
  const db = layoutThrashingDatabase as any;

  for (const category of Object.keys(db)) {
    for (const target of Object.keys(db[category])) {
      for (const [prop, info] of Object.entries(db[category][target])) {
        if ((info as any).riskLevel === "high") {
          if (!result[target]) result[target] = [];
          result[target].push(prop);
        }
      }
    }
  }

  return result;
}

export {
  layoutThrashingDatabase,
  isLayoutThrashing,
  getRiskLevel,
  getOperationInfo,
  getHighRiskOperations,
  type LayoutProperty,
  type LayoutCategory,
};
