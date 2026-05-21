import {
  AugmentationRequest,
  UiGenerationAgentCommandPayload,
  UiGenerationAgentMode,
  UiGenerationAgentResponse,
  UsabilityViolation,
} from "@/types";
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
  SimpleFieldSchema,
} from "../../services/dom-extractor";
import { z } from "zod";
import {
  generateText,
  Output,
  streamText,
  stepCountIs,
  tool,
  ToolLoopAgent,
  type ModelMessage,
} from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

import extractorPromptSystem from "../prompts/generate-extractor-system.txt?raw";
import extractorPromptUser from "../prompts/generate-extractor-user.txt?raw";
import uiPromptUser from "../prompts/generate-ui-user.txt?raw";
import markupPromptSystem from "../prompts/markup-system.txt?raw";
import markupPromptUser from "../prompts/markup-user.txt?raw";
import agentPromptSystem from "../prompts/agent-system.txt?raw";
import agentAuditPromptSystem from "../prompts/agent-audit-system.txt?raw";
import agentRevisionPromptSystem from "../prompts/agent-revision-system.txt?raw";
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
const MAX_AGENT_DRAFT_RENDERS = 3;
const DEFAULT_AGENT_AUDIT_PROMPT = "Fix usability and design issues in the UI";

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

const agentViolationSchema = z.object({
  ruleId: z.string().optional(),
  selector: z.string().min(1),
  description: z.string().min(1).max(180),
  resolutionPrompt: z.string().min(1).max(260),
});

const agentReportViolationsInputSchema = z.object({
  violations: z.array(agentViolationSchema).max(8),
});

const agentCreateExtractorInputSchema = z.object({
  rootSelector: z
    .string()
    .min(1)
    .describe("CSS selector for the root subtree to replace."),
  fields: z.record(z.string(), SimpleFieldSchema),
});

const agentInjectUiInputSchema = z.object({
  rootSelector: z
    .string()
    .min(1)
    .describe("CSS selector for the root subtree this HTML will replace."),
  html: z
    .string()
    .min(1)
    .describe("Single HTML fragment using Tailwind classes and data slots."),
});

const agentRenderUiDraftInputSchema = z.object({
  rootSelector: z
    .string()
    .min(1)
    .describe("CSS selector for the root subtree this HTML will replace."),
  html: z
    .string()
    .min(1)
    .describe(
      "Draft HTML fragment to render and screenshot before final injection.",
    ),
  notes: z
    .string()
    .max(400)
    .optional()
    .describe("Optional notes about what the draft is trying to improve."),
});

type AgentReportViolationsInput = z.infer<
  typeof agentReportViolationsInputSchema
>;

type AgentCreateExtractorInput = z.infer<
  typeof agentCreateExtractorInputSchema
>;

type AgentToolName =
  | "reportViolations"
  | "createExtractor"
  | "renderUiDraft"
  | "injectUi";

type AgentToolStage =
  | "audit"
  | "extractor"
  | "extractorOrDraft"
  | "draft"
  | "draftOrFinal"
  | "final"
  | "free";

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as any;
}

function normalizeAgentViolations(
  input: AgentReportViolationsInput,
): UsabilityViolation[] {
  return input.violations.map((violation) => ({
    ruleId: violation.ruleId ?? "agent-review",
    selector: violation.selector,
    description: violation.description,
    resolutionPrompt: violation.resolutionPrompt,
  }));
}

function createAgentUserMessage(
  input: UiGenerationAgentCommandPayload,
): ModelMessage {
  const prompt = input.prompt.trim() || DEFAULT_AGENT_AUDIT_PROMPT;
  const text = [
    "User request:",
    prompt,
    "",
    "Current page DOM snapshot:",
    input.snapshot?.prompt ?? "(No DOM snapshot was available.)",
    "",
    "Use the screenshot as the visual source of truth. Use selectors from the DOM snapshot when reporting violations and choosing replacement roots.",
  ].join("\n");

  return {
    role: "user",
    content: [
      {
        type: "text",
        text,
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
  };
}

function getAgentMode(input: UiGenerationAgentCommandPayload) {
  const prompt = input.prompt.trim();
  return (
    input.mode ??
    (prompt && prompt !== DEFAULT_AGENT_AUDIT_PROMPT ? "revision" : "audit")
  );
}

function getAgentInstructions(mode: UiGenerationAgentMode) {
  return [
    mode === "audit" ? agentAuditPromptSystem : agentRevisionPromptSystem,
    agentPromptSystem,
  ].join("\n\n");
}

function getMessageParts(message: ModelMessage): any[] {
  return Array.isArray(message.content) ? (message.content as any[]) : [];
}

function getLastToolCallInput<T>(
  messages: ModelMessage[],
  toolName: string,
  schema: z.ZodType<T>,
): T | null {
  for (const message of [...messages].reverse()) {
    for (const part of [...getMessageParts(message)].reverse()) {
      if (part?.type !== "tool-call" || part.toolName !== toolName) {
        continue;
      }

      const parsed = schema.safeParse(part.input);
      if (parsed.success) {
        return parsed.data;
      }
    }
  }

  return null;
}

function countToolCalls(messages: ModelMessage[] | undefined, toolName: string) {
  return (messages ?? []).reduce((count, message) => {
    return (
      count +
      getMessageParts(message).filter(
        (part) => part?.type === "tool-call" && part.toolName === toolName,
      ).length
    );
  }, 0);
}

function extractorFromAgentInput(input: AgentCreateExtractorInput) {
  return {
    root: {
      selector: input.rootSelector,
      output: "SelectedSection",
    },
    fields: input.fields,
  };
}

function stripHtmlCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function createExtractorToolResultMessage(
  result: UiGenerationAgentCommandPayload["extractorResult"],
): ModelMessage | null {
  if (!result) {
    return null;
  }

  const output = result.valid
    ? {
        valid: true,
        rootSelector: result.extractor.root.selector,
        data: result.data
          ? JSON.parse(recordToPromptJSON(result.data))
          : undefined,
        reference: {
          dom: result.snapshot?.prompt,
          html: result.markupContext?.html,
          styles: result.markupContext?.styles,
        },
      }
    : {
        valid: false,
        errors: result.errors ?? ["Extractor did not produce usable data."],
      };

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: result.toolCallId,
        toolName: "createExtractor",
        output: {
          type: "json",
          value: toJsonValue(output),
        },
      },
    ],
  };
}

function createExtractorReferenceMessage(
  result: UiGenerationAgentCommandPayload["extractorResult"],
): ModelMessage | null {
  if (!result?.valid || !result.screenshot) {
    return null;
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: "Reference screenshot for the replacement root selected by createExtractor.",
      },
      {
        type: "image",
        image: result.screenshot,
        mediaType: "image/jpeg",
      },
    ],
  };
}

function createDraftRenderToolResultMessage(
  result: UiGenerationAgentCommandPayload["draftRenderResult"],
  draftCount: number,
): ModelMessage | null {
  if (!result) {
    return null;
  }

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: result.toolCallId,
        toolName: "renderUiDraft",
        output: {
          type: "json",
          value: toJsonValue({
            success: result.success,
            screenshotAvailable: Boolean(result.screenshot),
            draftCount,
            maxDrafts: MAX_AGENT_DRAFT_RENDERS,
            error: result.error,
          }),
        },
      },
    ],
  };
}

function createDraftRenderReferenceMessage(
  result: UiGenerationAgentCommandPayload["draftRenderResult"],
): ModelMessage | null {
  if (!result?.success || !result.screenshot) {
    return null;
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: "Rendered screenshot of your draft replacement. If it looks good, call injectUi with this HTML. If you see visible design problems, revise the HTML and call renderUiDraft again. You may preview at most three drafts total.",
      },
      {
        type: "image",
        image: result.screenshot,
        mediaType: "image/jpeg",
      },
    ],
  };
}

function getAgentToolControls(input: UiGenerationAgentCommandPayload): {
  stage: AgentToolStage;
  activeTools?: AgentToolName[];
  toolChoice?:
    | "required"
    | {
        type: "tool";
        toolName: AgentToolName;
      };
} {
  if (!input.messages) {
    if (getAgentMode(input) === "revision") {
      return {
        stage: "extractor",
        activeTools: ["createExtractor"],
        toolChoice: {
          type: "tool",
          toolName: "createExtractor",
        },
      };
    }

    return {
      stage: "audit",
      activeTools: ["reportViolations"],
      toolChoice: {
        type: "tool",
        toolName: "reportViolations",
      },
    };
  }

  if (input.approval || input.extractorResult?.valid === false) {
    return {
      stage: "extractor",
      activeTools: ["createExtractor"],
      toolChoice: {
        type: "tool",
        toolName: "createExtractor",
      },
    };
  }

  if (input.draftRenderResult?.success === true) {
    const draftCount = countToolCalls(input.messages, "renderUiDraft");

    if (draftCount < MAX_AGENT_DRAFT_RENDERS) {
      return {
        stage: "draftOrFinal",
        activeTools: ["renderUiDraft", "injectUi"],
        toolChoice: "required",
      };
    }

    return {
      stage: "final",
    };
  }

  if (input.draftRenderResult?.success === false) {
    const draftCount = countToolCalls(input.messages, "renderUiDraft");

    return {
      stage: draftCount >= MAX_AGENT_DRAFT_RENDERS ? "final" : "draft",
    };
  }

  if (input.extractorResult?.valid === true) {
    return {
      stage: "extractorOrDraft",
      activeTools: ["createExtractor", "renderUiDraft"],
      toolChoice: "required",
    };
  }

  return {
    stage: "free",
    toolChoice: "required",
  };
}

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

  private createUiGenerationAgent(
    options: ReturnType<typeof getAgentToolControls>,
    mode: UiGenerationAgentMode,
  ) {
    return new ToolLoopAgent({
      id: "ui-generation-agent",
      model: this.openai("gpt-5.4-mini"),
      instructions: getAgentInstructions(mode),
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningEffort: "medium",
        },
      },
      stopWhen: stepCountIs(15),
      activeTools: options.activeTools,
      toolChoice: options.toolChoice,
      prepareStep: () => {
        const toolName =
          options.stage === "draft"
            ? "renderUiDraft"
            : options.stage === "final"
              ? "injectUi"
              : null;

        if (!toolName) return undefined;

        return {
          activeTools: [toolName],
          toolChoice: {
            type: "tool",
            toolName,
          },
        };
      },
      tools: {
        reportViolations: tool({
          description:
            "Report the usability issues found in the current UI and pause for user approval.",
          inputSchema: agentReportViolationsInputSchema,
          needsApproval: true,
          execute: async ({ violations }) => ({
            approved: true,
            count: violations.length,
          }),
        }),
        createExtractor: tool({
          description:
            "Request live DOM data extraction for the selected replacement root. The browser extension will execute this tool and return extracted data or validation errors.",
          inputSchema: agentCreateExtractorInputSchema,
        }),
        renderUiDraft: tool({
          description:
            "Submit draft replacement HTML for the browser extension to temporarily render and screenshot before final injection.",
          inputSchema: agentRenderUiDraftInputSchema,
        }),
        injectUi: tool({
          description:
            "Submit the final replacement HTML fragment for injection into the browser page. Use the rendered draft screenshot to revise visible design issues before calling this.",
          inputSchema: agentInjectUiInputSchema,
        }),
      },
    });
  }

  async runUiGenerationAgent(
    input: UiGenerationAgentCommandPayload,
  ): Promise<UiGenerationAgentResponse> {
    const messages: ModelMessage[] = input.messages
      ? [...input.messages]
      : [createAgentUserMessage(input)];

    if (input.approval) {
      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-approval-response",
            approvalId: input.approval.approvalId,
            approved: input.approval.approved,
            reason: input.approval.reason,
          },
        ],
      });
    }

    const extractorToolResultMessage = createExtractorToolResultMessage(
      input.extractorResult,
    );
    if (extractorToolResultMessage) {
      messages.push(extractorToolResultMessage);
    }

    const extractorReferenceMessage = createExtractorReferenceMessage(
      input.extractorResult,
    );
    if (extractorReferenceMessage) {
      messages.push(extractorReferenceMessage);
    }

    const draftRenderToolResultMessage = createDraftRenderToolResultMessage(
      input.draftRenderResult,
      countToolCalls(input.messages, "renderUiDraft"),
    );
    if (draftRenderToolResultMessage) {
      messages.push(draftRenderToolResultMessage);
    }

    const draftRenderReferenceMessage = createDraftRenderReferenceMessage(
      input.draftRenderResult,
    );
    if (draftRenderReferenceMessage) {
      messages.push(draftRenderReferenceMessage);
    }

    const result = await this.createUiGenerationAgent(
      getAgentToolControls(input),
      getAgentMode(input),
    ).generate({
      messages,
    });

    const nextMessages = [
      ...messages,
      ...(result.response.messages as ModelMessage[]),
    ];
    const content = result.content as any[];

    const approvalRequest = content.find(
      (part) =>
        part?.type === "tool-approval-request" &&
        part.toolCall?.toolName === "reportViolations",
    );

    if (approvalRequest) {
      const parsed = agentReportViolationsInputSchema.safeParse(
        approvalRequest.toolCall.input,
      );
      const violations = parsed.success
        ? normalizeAgentViolations(parsed.data)
        : [];

      if (violations.length === 0) {
        return {
          status: "done",
          messages: nextMessages,
          text: "No clear usability issues were reported.",
        };
      }

      return {
        status: "needsApproval",
        messages: nextMessages,
        approvalId: approvalRequest.approvalId,
        toolCallId: approvalRequest.toolCall.toolCallId,
        violations,
      };
    }

    const createExtractorCall = [...content]
      .reverse()
      .find(
        (part) =>
          part?.type === "tool-call" && part.toolName === "createExtractor",
      );

    if (createExtractorCall) {
      const parsed = agentCreateExtractorInputSchema.safeParse(
        createExtractorCall.input,
      );

      if (!parsed.success) {
        return {
          status: "error",
          messages: nextMessages,
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n"),
        };
      }

      return {
        status: "needsExtractorResult",
        messages: nextMessages,
        toolCallId: createExtractorCall.toolCallId,
        extractor: extractorFromAgentInput(parsed.data),
      };
    }

    const renderUiDraftCall = [...content]
      .reverse()
      .find(
        (part) =>
          part?.type === "tool-call" && part.toolName === "renderUiDraft",
      );

    if (renderUiDraftCall) {
      const parsed = agentRenderUiDraftInputSchema.safeParse(
        renderUiDraftCall.input,
      );

      if (!parsed.success) {
        return {
          status: "error",
          messages: nextMessages,
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n"),
        };
      }

      const extractorInput = getLastToolCallInput(
        nextMessages,
        "createExtractor",
        agentCreateExtractorInputSchema,
      );

      if (!extractorInput) {
        return {
          status: "error",
          messages: nextMessages,
          error: "The agent submitted a UI draft before creating an extractor.",
        };
      }

      return {
        status: "needsDraftRender",
        messages: nextMessages,
        toolCallId: renderUiDraftCall.toolCallId,
        extractor: extractorFromAgentInput(extractorInput),
        spec: stripHtmlCodeFence(parsed.data.html),
      };
    }

    const injectUiCall = [...content]
      .reverse()
      .find(
        (part) => part?.type === "tool-call" && part.toolName === "injectUi",
      );

    if (injectUiCall) {
      const parsed = agentInjectUiInputSchema.safeParse(injectUiCall.input);

      if (!parsed.success) {
        return {
          status: "error",
          messages: nextMessages,
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n"),
        };
      }

      const extractorInput = getLastToolCallInput(
        nextMessages,
        "createExtractor",
        agentCreateExtractorInputSchema,
      );

      if (!extractorInput) {
        return {
          status: "error",
          messages: nextMessages,
          error: "The agent submitted UI before creating an extractor.",
        };
      }

      return {
        status: "readyToInject",
        messages: nextMessages,
        toolCallId: injectUiCall.toolCallId,
        extractor: extractorFromAgentInput(extractorInput),
        spec: stripHtmlCodeFence(parsed.data.html),
      };
    }

    return {
      status: "done",
      messages: nextMessages,
      text: result.text,
    };
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
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        },
      },
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

    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          strictJsonSchema: false,
          reasoningEffort: "low",
        },
      },
      output: Output.object({
        schema: LLMSimpleDOMExtractorSpecSchema,
      }),
      system: promptSystem,
      prompt: promptUser,
    });

    // const result = {
    //   output: {
    //     fields: {
    //       timer: { type: "text", selector: "div.rounded-full > span" },
    //     },
    //   },
    // };

    return {
      root: {
        selector: rootSelector || undefined,
        output: "SelectedSection",
      },
      fields: result.output.fields,
    };
  }
}
