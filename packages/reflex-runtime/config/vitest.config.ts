import { defineConfig } from "vitest/config";
import { profileOfMode, vitestProfile } from "./vitest.ts";

export default defineConfig(({ mode }) => vitestProfile(profileOfMode(mode)));
