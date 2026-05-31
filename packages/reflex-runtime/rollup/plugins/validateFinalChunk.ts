import type { Plugin } from "rollup";

export function validateFinalChunkPlugin(): Plugin {
  return {
    name: "validate-final-chunk",
    renderChunk(code) {
      try {
        this.parse(code);
      } catch (error) {
        this.error({
          code: "REFLEX_FINAL_CHUNK_PARSE_ERROR",
          message: "Final generated chunk is not valid JavaScript.",
          cause: error,
        });
      }

      return null;
    },
  };
}
