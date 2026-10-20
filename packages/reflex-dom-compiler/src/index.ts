export {
  reflexDOMCompiler as default,
  reflexDOMCompiler,
  transformReflexDOM,
  DEFAULT_FACTORY_SOURCES,
  DEFAULT_RENDER_SOURCES,
  DEFAULT_OPERATOR_SOURCES,
  DEFAULT_RUNTIME_MODULE,
  AUTO_TEMPLATE_MIN_NODES,
  MAX_HOLES,
  MAX_TEMPLATE_HOLES,
  type ReflexDOMCompilerOptions,
  type TransformResult,
} from "./transform";
export {
  formatReport,
  summarizeReport,
  type CompilerReport,
  type RegionReport,
  type RegionStrategy,
  type ReportSummary,
} from "./diagnostics";
