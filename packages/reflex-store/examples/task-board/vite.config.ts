import { defineConfig } from "vite";
import reflexStore from "@volynets/reflex-store/vite";

export default defineConfig({
  plugins: [reflexStore()],
});
