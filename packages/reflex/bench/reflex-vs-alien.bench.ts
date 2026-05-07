import { alienVariant, reflexVariant } from "./harnesses";
import { registerBenchFile } from "./shared";

registerBenchFile("reflex-vs-alien", [reflexVariant, alienVariant]);
