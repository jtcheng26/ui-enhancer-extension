import { AugmentationRequest, UsabilityViolation } from "@/types";
import {
  AIProvider,
  UIRequest,
  UsabilityDetectionRequest,
} from "./ai-provider";
import {
  ClickActionValue,
  DOMExtractorSpec,
  InputValue,
  LLMSimpleDOMExtractorSpecSchema,
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
  | string
  | number
  | boolean
  | null
  | Shape[]
  | { [key: string]: Shape };

const MAX_PROMPT_STRING_LENGTH = 240;
const MAX_PROMPT_ARRAY_ITEMS = 8;
const MAX_PROMPT_OBJECT_KEYS = 24;

function clipPromptString(value: string): string {
  return value.length <= MAX_PROMPT_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_PROMPT_STRING_LENGTH)}...`;
}

function isClickActionValue(value: ExtractedValue): value is ClickActionValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "type" in value &&
    value.type === "clickAction"
  );
}

function isInputValue(value: ExtractedValue): value is InputValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "type" in value &&
    value.type === "input"
  );
}

function normalizeExtractedValueForPrompt(value: ExtractedValue): Shape {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return clipPromptString(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PROMPT_ARRAY_ITEMS)
      .map((item) => normalizeExtractedValueForPrompt(item));
  }

  if (isClickActionValue(value)) {
    return {
      type: value.type,
      selector: value.selector,
    } as { [key: string]: Shape };
  }

  if (isInputValue(value)) {
    return Object.fromEntries(
      Object.entries({
        ...value,
        value: value.value ? clipPromptString(value.value) : value.value,
        options: value.options?.slice(0, MAX_PROMPT_ARRAY_ITEMS),
      }).filter(([, nestedValue]) => nestedValue !== undefined),
    ) as { [key: string]: Shape };
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_PROMPT_OBJECT_KEYS)
      .map(([key, nestedValue]) => [
        key,
        normalizeExtractedValueForPrompt(nestedValue),
      ]),
  );
}

export function recordToPromptJSON(
  input: Record<string, ExtractedValue>,
): string {
  const normalized = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      normalizeExtractedValueForPrompt(value),
    ]),
  );
  return JSON.stringify(normalized, null, 2);
}

const usabilityViolationsSchema = z.object({
  violations: z.array(
    z.object({
      ruleId: z.string(),
      selector: z.string().min(1),
      description: z.string().min(1).max(160),
      resolutionPrompt: z.string().min(1).max(220),
    }),
  ),
});

const usabilityRuleAuditSystemPrompt = [
  "You are a senior product designer reviewing a UI against a supplied usability rule set.",
  "Use the screenshot to judge visual hierarchy, spacing, affordance, emphasis, density, readability, and state clarity.",
  "Use the DOM tree to choose exact selectors from the provided nodes.",
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
  "Use the DOM tree only to map each issue to an exact selector from the provided nodes.",
  "Report the clearest problems that would noticeably improve the product if fixed.",
  "Do not report trivial polish or speculative issues that are not visible or strongly implied.",
  "If multiple symptoms are caused by one larger problem, prefer the higher-level issue.",
  "Use selector values matching the tree.",
  "Descriptions should be brief, specific, and insight-driven, explaining the actual usability failure.",
  "resolutionPrompt should be a direct instruction to modify the UI so the issue is resolved.",
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
    const data = recordToPromptJSON(input.data);
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
    const data = recordToPromptJSON(input.data);
    const systemPrompt = loadPrompt(markupPromptSystem, {});
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
            ...(input.screenshot
              ? [
                  {
                    type: "image" as const,
                    image: input.screenshot,
                    mediaType: "image/jpeg",
                  },
                ]
              : []),
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
        return `<div class="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-5 py-4 shadow-sm">
  <span class="text-base font-medium tracking-wide text-gray-500">Remaining time</span>
  <span class="ml-3 text-lg font-semibold tabular-nums text-gray-700">{{data.timer}}</span>
</div>`;
      case "markup":
        return await this.generateMarkup(input);
    }
  }

  async detectUsabilityIssues(
    input: UsabilityDetectionRequest,
  ): Promise<UsabilityViolation[]> {
    const prompt = input.useRules
      ? [
          "Audit the UI against the supplied rule set. Prefer enabled rules first; only use disabled rules if the issue is clearly still valid.",
          "Rules:",
          JSON.stringify(input.rules),
          "DOM tree:",
          input.snapshot.prompt,
        ].join("\n\n")
      : [
          "Audit the UI for any clear usability issues.",
          "DOM tree:",
          input.snapshot.prompt,
        ].join("\n\n");

    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          strictJsonSchema: true,
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
    const dom = input.snapshot?.prompt ?? "";
    const rootSelector = input.snapshot?.selector ?? "";

    const promptSystem = loadPrompt(extractorPromptSystem, {});

    const promptUser = loadPrompt(extractorPromptUser, {
      dom,
      prompt: input.prompt,
    });

    // const result = await generateText({
    //   model: this.openai("gpt-5.4-mini"),
    //   providerOptions: {
    //     openai: {
    //       strictJsonSchema: false,
    //     },
    //   },
    //   output: Output.object({
    //     schema: LLMSimpleDOMExtractorSpecSchema,
    //   }),
    //   system: promptSystem,
    //   prompt: promptUser,
    // });

    const result = {
      output: {
        fields: {
          timer: { type: "text", selector: "div.rounded-full > span" },
        },
      },
    };

    return {
      root: {
        selector: rootSelector || undefined,
        output: "SelectedSection",
      },
      fields: result.output.fields,
    };
  }
}
