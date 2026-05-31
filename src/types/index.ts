import type {
  DOMExtractorSpec,
  ExtractedValue,
} from "../services/dom-extractor";
import { RenderSystemId } from "@/services/renderer/renderer";
import type { ModelMessage } from "ai";

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SelectedElement {
  id: string;
  tagName: string;
  selector: string;
  textPreview: string;
  attributes: Record<string, string>;
  rect: ElementRect;
  pageUrl: string;
  selectedAt: string;
}

export interface JsonifiedDomNode {
  selector?: string;
  selectors?: string[];
  role: string;
  tag?: string;
  name?: string;
  description?: string;
  text?: string;
  value?: string;
  level?: number;
  interactive?: boolean;
  states?: string[];
  attrs?: Record<string, string>;
  children?: JsonifiedDomNode[];
  truncatedChildCount?: number;
  truncated?: boolean;
}

export interface SelectedDomTreeSnapshot {
  selectedElementId: string;
  selector: string;
  pageUrl: string;
  tree: JsonifiedDomNode;
  prompt: string;
}

export interface MarkupStyleSnapshot {
  selector: string;
  tagName: string;
  styles: Record<string, string>;
}

export interface SelectedMarkupContext {
  selector: string;
  html: string;
  styles: MarkupStyleSnapshot[];
}

export interface AugmentationRequest {
  id: string;
  prompt: string;
  createdAt: string;
  source: "popup" | "sidepanel" | "content";
  status: "draft" | "queued" | "mock-submitted";
  snapshot?: SelectedDomTreeSnapshot;
}

export interface CreateUiCommandPayload {
  prompt: string;
  source: AugmentationRequest["source"];
  snapshot: SelectedDomTreeSnapshot;
  markupContext?: SelectedMarkupContext;
  screenshot: string;
  strategy: RenderSystemId;
  data: Record<string, ExtractedValue>;
}

export interface UsabilityRule {
  id: string;
  category?: string;
  title: string;
  description: string;
  resolutionGuidance?: string;
  enabled: boolean;
}

export interface UsabilityViolation {
  ruleId?: string;
  selector: string;
  description: string;
  resolutionPrompt: string;
}

export interface UsabilityGenerationTask {
  id: string;
  rootViolation: UsabilityViolation;
  violations: UsabilityViolation[];
  selectedElement: SelectedElement;
  prompt: string;
}

export interface UsabilityDetectionContext {
  snapshot: SelectedDomTreeSnapshot;
  screenshot: string;
}

export interface DetectUsabilityCommandPayload {
  source: AugmentationRequest["source"];
  useRules: boolean;
  rules: UsabilityRule[];
  snapshot?: SelectedDomTreeSnapshot;
  screenshot?: string;
}

export interface UiGenerationAgentExtractorResult {
  toolCallId: string;
  extractor: DOMExtractorSpec;
  valid: boolean;
  errors?: string[];
  data?: Record<string, ExtractedValue>;
  snapshot?: SelectedDomTreeSnapshot;
  markupContext?: SelectedMarkupContext;
  screenshot?: string;
}

export interface UiGenerationAgentDraftRenderResult {
  toolCallId: string;
  kind?: "ui" | "css";
  extractor?: DOMExtractorSpec;
  spec?: string;
  css?: UiGenerationAgentCssInjection;
  success: boolean;
  screenshot?: string;
  renderedHtml?: string;
  error?: string;
}

export type UiGenerationAgentMode = "audit" | "revision";

export interface UiGenerationAgentCommandPayload {
  prompt: string;
  mode?: UiGenerationAgentMode;
  source: AugmentationRequest["source"];
  useRules?: boolean;
  rules?: UsabilityRule[];
  snapshot?: SelectedDomTreeSnapshot;
  screenshot?: string;
  messages?: ModelMessage[];
  approval?: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  };
  extractorResult?: UiGenerationAgentExtractorResult;
  draftRenderResult?: UiGenerationAgentDraftRenderResult;
}

export interface UiGenerationAgentTokenUsage {
  inputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokens?: number;
  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export type UiGenerationAgentResponse =
  | {
      status: "needsApproval";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      approvalId: string;
      toolCallId: string;
      violations: UsabilityViolation[];
    }
  | {
      status: "needsExtractorResult";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      toolCallId: string;
      extractor: DOMExtractorSpec;
    }
  | {
      status: "needsDraftRender";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      toolCallId: string;
      kind: "ui";
      extractor: DOMExtractorSpec;
      spec: string;
    }
  | {
      status: "needsDraftRender";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      toolCallId: string;
      kind: "css";
      css: UiGenerationAgentCssInjection;
    }
  | {
      status: "readyToInject";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      toolCallId: string;
      extractor: DOMExtractorSpec;
      spec: string;
      css?: UiGenerationAgentCssInjection;
    }
  | {
      status: "readyToInjectCss";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      toolCallId: string;
      css: UiGenerationAgentCssInjection;
    }
  | {
      status: "done";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      text: string;
    }
  | {
      status: "error";
      messages: ModelMessage[];
      usage?: UiGenerationAgentTokenUsage;
      error: string;
    };

export interface DomQueryPayload {
  selector: string;
  limit?: number;
  includeStyles?: string[];
}

export interface DomQueryElement {
  selector: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
}

export interface InjectedAugmentation {
  id: string;
  kind: "placeholder-card" | "button" | "overlay" | "css";
  label: string;
  containerId: string;
  createdAt: string;
  status: "injected" | "removed";
}

interface PersistedAugmentationBase {
  id: string;
  label: string;
  pageUrl: string;
  enabled: boolean;
  kind?: "ui" | "css";
  rootSelector?: string;
  css?: string;
  createdAt: string;
  updatedAt: string;
}

export type PersistedAugmentation =
  | (PersistedAugmentationBase & {
      kind?: "ui";
      extractor: DOMExtractorSpec;
      spec: string;
      renderSystemId: RenderSystemId;
    })
  | (PersistedAugmentationBase & {
      kind: "css";
      extractor?: never;
      spec?: never;
      renderSystemId?: never;
      css: string;
    });

export interface PersistedAugmentationStore {
  list(): Promise<PersistedAugmentation[]>;
  upsert(augmentation: PersistedAugmentation): Promise<PersistedAugmentation>;
  setEnabled(
    id: string,
    enabled: boolean,
  ): Promise<PersistedAugmentation | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface UiGenerationAgentCssInjection {
  rootSelector?: string;
  label?: string;
  css: string;
}

export interface ParsedSchema {
  id: string;
  sourceUrl: string;
  format: "json" | "yaml" | "unknown";
  title?: string;
  version?: string;
  document: unknown;
  endpointPaths: string[];
  warnings: string[];
  discoveredAt: string;
}

export interface StoredAugmentationConfig {
  id: string;
  name: string;
  selector: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  promptTemplate?: string;
  notes?: string;
}

export interface ExtensionSettings {
  selectionModeEnabled: boolean;
  injectDemoCardOnLoad: boolean;
  customSchemaUrl: string;
  lastCommand?: string;
}

export interface SchemaDiscoveryCandidate {
  url: string;
  source: "default" | "custom";
}

export interface SchemaDiscoveryOptions {
  baseUrl: string;
  customUrl?: string;
  persistResult?: boolean;
}

export interface SchemaDiscoveryResult {
  schema?: ParsedSchema;
  attemptedUrls: string[];
  errors: string[];
}

export type ExtensionRuntimeMessage =
  | {
      type: "command/submit";
      payload: AugmentationRequest;
    }
  | {
      type: "command/get-usability-context";
    }
  | {
      type: "command/detect-usability";
      payload: DetectUsabilityCommandPayload;
    }
  | {
      type: "command/run-ui-agent";
      payload: UiGenerationAgentCommandPayload;
    }
  | {
      type: "command/create-ui";
      payload: CreateUiCommandPayload;
    }
  | {
      type: "augmentation/inject";
      payload: {
        extractor: DOMExtractorSpec;
        spec: string;
        renderSystemId: RenderSystemId;
      };
    }
  | {
      type: "schema/discover";
      payload: SchemaDiscoveryOptions;
    }
  | {
      type: "selection/toggle";
      payload: {
        enabled: boolean;
      };
    }
  | {
      type: "floating-ui/open";
      payload?: {
        source: "selection" | "toolbar";
        selectedElement?: SelectedElement | null;
      };
    }
  | {
      type: "floating-ui/close";
    }
  | {
      type: "usability/get-context";
    }
  | {
      type: "usability/show-violations";
      payload: {
        violations: UsabilityViolation[];
      };
    }
  | {
      type: "usability/clear-violations";
    }
  | {
      type: "dom/query";
      payload: DomQueryPayload;
    };
