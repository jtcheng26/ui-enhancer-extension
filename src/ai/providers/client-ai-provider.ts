import { AugmentationRequest } from "@/types";
import { AIProvider, UIRequest } from "./ai-provider";
import {
  DOMExtractorSpec,
  DOMExtractorSpecSchema,
  ExtractedValue,
} from "../../services/dom-extractor";
import { z } from "zod";
import { generateText, Output, streamText } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

import extractorPromptSystem from "../prompts/generate-extractor-system.txt?raw";
import extractorPromptUser from "../prompts/generate-extractor-user.txt?raw";
import uiPromptUser from "../prompts/generate-ui-user.txt?raw";
import markupPromptSystem from "../prompts/markup-system.txt?raw";
import markupPromptUser from "../prompts/markup-user.txt?raw";
import { jsonRenderSystemPrompt } from "../ui/prompt";
import ExampleMarkup from "@/schema/markup.txt?raw";

// import Raw from "../prompts/temp.txt?raw";
import { compileSpecStream } from "@json-render/core";

function loadPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

type Shape =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "clickAction"
  | { type: "array"; items: Shape }
  | { type: "object"; properties: Record<string, Shape> };

function getShape(value: ExtractedValue): Shape {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // ambiguous → treat as unknown array
      return { type: "array", items: "null" };
    }
    return {
      type: "array",
      items: getShape(value[0]), // assume homogeneous
    };
  }

  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      if (value.type === "clickAction") return "clickAction";
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, getShape(v)]),
        ),
      };
    default:
      throw new Error("Unsupported type");
  }
}

export function recordToShapeJSON(
  input: Record<string, ExtractedValue>,
): string {
  const shape = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, getShape(v)]),
  );
  return JSON.stringify(shape, null, 2);
}

export class ClientAIProvider implements AIProvider {
  openai: OpenAIProvider;
  constructor(apiKey: string) {
    this.openai = createOpenAI({
      apiKey,
    });
  }

  async generateJsonRender(input: UIRequest): Promise<string> {
    const dom = JSON.stringify(input.snapshot);
    const data = recordToShapeJSON(input.data);
    const promptUser = loadPrompt(uiPromptUser, {
      // dom,
      data,
      prompt: input.prompt,
    });
    console.log(jsonRenderSystemPrompt);
    console.log(promptUser);
    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        },
      },
      system: jsonRenderSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptUser,
            },
            // {
            //   type: "image",
            //   image: input.screenshot,
            // },
          ],
        },
      ],
    });
    const stream = result.text;
    return stream;
  }

  async generateMarkup(input: UIRequest): Promise<string> {
    const data = recordToShapeJSON(input.data);
    const promptUser = loadPrompt(markupPromptUser, {
      // dom,
      data,
      prompt: input.prompt,
    });
    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      // providerOptions: {
      //   openai: {
      //     reasoningEffort: "low",
      //   },
      // },
      system: markupPromptSystem,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptUser,
            },
          ],
        },
      ],
    });
    return result.text;
    // return ExampleMarkup;
  }

  async generateUI(input: UIRequest): Promise<string> {
    switch (input.strategy) {
      case "json-render":
        return await this.generateJsonRender(input);
      case "sample":
        return "a";
      case "markup":
        return await this.generateMarkup(input);
    }
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
