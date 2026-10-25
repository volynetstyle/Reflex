import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import reflexDOMCompiler from "../../../reflex-dom-compiler/src/vite";
import { summarizeReport, type CompilerReport } from "../../../reflex-dom-compiler/src/diagnostics";

export default defineConfig(() => {
  const reports: CompilerReport[] = [];
  return {
    plugins: [
      reflexDOMCompiler({
        strategy: "auto",
        include: /\/apps\/reflex-dom\/.*\.[jt]sx?$/,
        onReport: (report) => reports.push(report),
      }),
      {
        name: "reflex-dom-compiler:benchmark-report",
        generateBundle() {
          const summary = summarizeReport({ filename: null, disabled: false, regions: reports.flatMap(r => r.regions) });
          console.log(`DOM compiler: ${summary.template} template, ${summary.native} native, ${summary.runtime} runtime regions`);
          this.emitFile({
            type: "asset", fileName: "compiler-report.json",
            source: JSON.stringify({ strategy: "auto", summary, reports }, null, 2),
          });
        },
      },
    ],
    resolve: {
      alias: [{
        find: "@volynets/reflex-dom-compiler/runtime",
        replacement: fileURLToPath(new URL("../../../reflex-dom-compiler/src/runtime.ts", import.meta.url)),
      }],
    },
  };
});
