import { AugmentationRequest } from "@/types";
import { AIProvider, UIRequest, UISpec } from "./ai-provider";
import {
  DOMExtractorSpec,
  DOMExtractorSpecSchema,
} from "../../services/dom-extractor";
import { z } from "zod";
import { generateText, Output, streamText } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

import extractorPromptSystem from "../prompts/generate-extractor-system.txt?raw";
import extractorPromptUser from "../prompts/generate-extractor-user.txt?raw";
import uiPromptUser from "../prompts/generate-ui-user.txt?raw";
import { jsonRenderSystemPrompt } from "../ui/prompt";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const JsonRenderElementSchema = z.object({
  type: z.string().min(1),
  props: z.record(z.string(), JsonValueSchema),
  children: z.array(z.string()).optional(),
  visible: JsonValueSchema.optional(),
  on: z.record(z.string(), JsonValueSchema).optional(),
  repeat: z
    .object({
      statePath: z.string(),
      key: z.string().optional(),
    })
    .optional(),
  watch: z.record(z.string(), JsonValueSchema).optional(),
});

const JsonRenderSpecSchema = z.object({
  root: z.string().min(1),
  elements: z.record(z.string(), JsonRenderElementSchema),
  state: z.record(z.string(), JsonValueSchema).optional(),
});

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

  async generateUI(input: UIRequest): Promise<UISpec> {
    const dom = JSON.stringify(input.snapshot);
    const data = JSON.stringify(input.data);
    const promptUser = loadPrompt(uiPromptUser, {
      dom,
      data,
      prompt: input.prompt,
    });
    console.log(jsonRenderSystemPrompt)
    console.log(promptUser)
    // const result = streamText({
    //   model: "anthropic/claude-haiku-4.5",
    //   system: jsonRenderSystemPrompt,
    //   prompt: input.prompt,
    // });
    throw new Error("stuff");
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
