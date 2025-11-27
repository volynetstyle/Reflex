import { defineConfig } from "vite"

export default defineConfig(({ mode }) => {
  return {
    define: {
      __REFLEX_MODE__: JSON.stringify(mode),
    },
  }
})
