export {
  reflexDOMCompiler as default,
  reflexDOMCompiler,
  transformReflexDOM,
  DEFAULT_FACTORY_SOURCES,
  DEFAULT_RENDER_SOURCES,
  DEFAULT_RUNTIME_MODULE,
  DEFAULT_TEMPLATE_THRESHOLD,
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
