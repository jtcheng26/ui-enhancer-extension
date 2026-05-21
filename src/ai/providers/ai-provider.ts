import {
  AugmentationRequest,
  CreateUiCommandPayload,
  UsabilityDetectionContext,
  UsabilityRule,
  UsabilityViolation,
  UiGenerationAgentCommandPayload,
  UiGenerationAgentResponse,
} from "@/types";
import { DOMExtractorSpec } from "../../services/dom-extractor";
import { Spec } from "@json-render/react";

export type UIRequest = CreateUiCommandPayload;

export interface UsabilityDetectionRequest extends UsabilityDetectionContext {
  source: AugmentationRequest["source"];
  useRules: boolean;
  rules: UsabilityRule[];
}

export interface AIProvider {
  generateExtractor(input: AugmentationRequest): Promise<DOMExtractorSpec>;
  generateUI(input: UIRequest): Promise<string>;
  detectUsabilityIssues(
    input: UsabilityDetectionRequest,
  ): Promise<UsabilityViolation[]>;
  runUiGenerationAgent(
    input: UiGenerationAgentCommandPayload,
  ): Promise<UiGenerationAgentResponse>;
}
