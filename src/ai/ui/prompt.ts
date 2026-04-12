import { streamText } from "ai";
import { catalog } from "./catalog";

// Standalone mode is the default (no mode option needed)
export const jsonRenderSystemPrompt = catalog.prompt({
  customRules: [
    "Use Card as root for forms and small UIs.",
    "Use Grid for multi-column layouts.",
  ],
});
