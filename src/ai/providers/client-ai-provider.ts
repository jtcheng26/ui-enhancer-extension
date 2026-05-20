import { AugmentationRequest, UsabilityViolation } from "@/types";
import {
  AIProvider,
  UIRequest,
  UsabilityDetectionRequest,
} from "./ai-provider";
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
import rulesSpec from "../prompts/rules.json";

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

const usabilityViolationsSchema = z.object({
  violations: z.array(
    z.object({
      ruleId: z.string().min(1),
      selector: z.string().min(1),
      description: z.string().min(1).max(160),
      resolutionPrompt: z.string().min(1).max(220),
    }),
  ),
});

const usabilityRuleAuditSystemPrompt = [
  "You are a senior product designer reviewing a UI against a supplied usability rule set.",
  "Use the screenshot to judge visual hierarchy, spacing, affordance, emphasis, density, readability, and state clarity.",
  "Use the accessibility tree to choose exact selectors from the provided nodes.",
  "Report only meaningful issues that would materially improve the interface if fixed.",
  "Prefer issues that affect comprehension, task flow, or interaction clarity over cosmetic nits.",
  "Anchor every issue to the best matching rule from the passed-in rules.",
  "Do not invent selectors. Use selector values exactly as provided in the tree.",
  "Descriptions should be brief, concrete, and explain what is wrong in user-facing terms.",
  "resolutionPrompt should be an imperative fix instruction for UI generation, focused on what to change.",
  "Avoid generic advice like 'improve layout' unless you specify the affected element and the intended change.",
  "Return a small, high-signal set of violations rather than an exhaustive list.",
].join(" ");

const usabilityOpenEndedSystemPrompt = [
  "You are a sharp product designer critiquing a UI for substantive usability problems.",
  "Inspect the screenshot first for issues in hierarchy, task flow, discoverability, clutter, ambiguous controls, weak state communication, layout imbalance, readability, and accessibility.",
  "Use the accessibility tree only to map each issue to an exact selector from the provided nodes.",
  "Report the clearest problems that would noticeably improve the product if fixed.",
  "Do not report trivial polish or speculative issues that are not visible or strongly implied.",
  "If multiple symptoms are caused by one larger problem, prefer the higher-level issue.",
  "Use selector values exactly as provided in the tree.",
  "Descriptions should be brief, specific, and insight-driven, explaining the actual usability failure.",
  "resolutionPrompt should be a direct instruction to modify the UI so the issue is resolved.",
  "For ruleId, use the closest matching passed-in rule id when possible; if no rule meaningfully fits, use 'general-usability'.",
  "Return a concise, high-value set of violations, not a long checklist.",
].join(" ");

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
    const rules = rulesSpec.rules
      .map((r, i) => `**${i + 1}. ${r.title}**\n${r.description}\n`)
      .join("\n");
    const html = input.markupContext?.html ?? "";
    const styles = JSON.stringify(input.markupContext?.styles ?? [], null, 2);
    const data = recordToShapeJSON(input.data);
    const systemPrompt = loadPrompt(markupPromptSystem, { rules });
    const promptUser = loadPrompt(markupPromptUser, {
      html,
      styles,
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
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptUser,
            },
            // ...(input.screenshot
            //   ? [
            //       {
            //         type: "image" as const,
            //         image: input.screenshot,
            //         mediaType: "image/jpeg",
            //       },
            //     ]
            //   : []),
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

  async detectUsabilityIssues(
    input: UsabilityDetectionRequest,
  ): Promise<UsabilityViolation[]> {
    const prompt = [
      input.useRules
        ? "Audit the UI against the supplied rule set. Prefer enabled rules first; only use disabled rules if the issue is clearly still valid."
        : "Identify the most important usability issues you can clearly infer from this UI, even if they are not directly dictated by the supplied rules.",
      "Rules:",
      JSON.stringify(input.rules),
      "Accessibility tree:",
      JSON.stringify(input.snapshot.tree),
    ].join("\n\n");

    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          strictJsonSchema: false,
        },
      },
      output: Output.object({
        schema: usabilityViolationsSchema,
      }),
      system: input.useRules
        ? usabilityRuleAuditSystemPrompt
        : usabilityOpenEndedSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image",
              image: input.screenshot,
              mediaType: "image/jpeg",
            },
          ],
        },
      ],
    });

    return result.output.violations;
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
