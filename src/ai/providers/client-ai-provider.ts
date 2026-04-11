import { AugmentationRequest } from "@/types";
import { AIProvider } from "./ai-provider";
import {
  DOMExtractorSpec,
  DOMExtractorSpecSchema,
} from "../../services/dom-extractor";
import { generateText, Output } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

import extractorPromptSystem from "../prompts/generate-extractor-system.txt?raw";
import extractorPromptUser from "../prompts/generate-extractor-user.txt?raw";

function loadPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export class ClientAIProvider implements AIProvider {
  openai: OpenAIProvider;
  constructor(apiKey: string) {
    this.openai = createOpenAI({
      apiKey,
    });
  }

  generateUI(input: object): Promise<object> {
    throw new Error("Method not implemented.");
  }

  async generateExtractor(
    input: AugmentationRequest,
  ): Promise<DOMExtractorSpec> {
    const dom = JSON.stringify(input.snapshot);

    const promptSystem = loadPrompt(extractorPromptSystem, {
      dom,
    });

    const promptUser = loadPrompt(extractorPromptUser, {
      dom,
    });

    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        },
      },
      output: Output.object({
        schema: DOMExtractorSpecSchema,
      }),
      system: promptSystem,
      prompt: promptUser,
    });

    return result.output;
  }
}
