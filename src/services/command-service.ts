import type {
  AugmentationRequest,
  ExtensionRuntimeMessage,
  SelectedElement,
  UsabilityDetectionContext,
  UsabilityViolation,
} from "../types";
import { requestStore } from "../storage/request-store";
import { settingsStore } from "../storage/settings-store";
import { logger } from "../utils/logger";
import {
  inspectSelectedMarkupContext,
  inspectSelectedDomTree,
  resolveSelectedElement,
  screenshotElement,
  withElementHidden,
} from "./dom-inspection-service";
import { DOMExtractorSpec, ExtractedValue } from "./dom-extractor";
import { RenderSystemId } from "./renderer/renderer";
import rulesSpec from "../ai/prompts/rules.json";

interface SubmitAugmentationRequestOptions {
  selectedElement?: SelectedElement | null;
}

export async function submitAugmentationRequest(
  prompt: string,
  source: AugmentationRequest["source"],
  options: SubmitAugmentationRequestOptions = {},
): Promise<DOMExtractorSpec | null> {
  const domTreeSnapshot = inspectSelectedDomTree(
    options.selectedElement ?? null,
  );

  const request: AugmentationRequest = {
    id: crypto.randomUUID(),
    prompt: prompt.trim(),
    createdAt: new Date().toISOString(),
    source,
    status: "mock-submitted",
    snapshot: domTreeSnapshot ?? undefined,
  };

  await requestStore.add(request);
  await requestStore.trim();
  await settingsStore.patch({
    lastCommand: request.prompt,
  });

  logger.info("Stored mock augmentation request for future AI handling.", {
    request,
    domTreeSnapshot,
  });

  const res = await browser.runtime.sendMessage({
    type: "command/submit",
    payload: request,
  });

  if (!res || !res?.data) logger.error("Failed to return extraction spec.");
  return res?.data ?? null;
}

interface CreateUiSpecOptions {
  selectedElement?: SelectedElement | null;
  data: Record<string, ExtractedValue>;
  strategy: RenderSystemId;
}

export async function createUiSpec(
  prompt: string,
  source: AugmentationRequest["source"],
  screenshot: string,
  options: CreateUiSpecOptions,
): Promise<string | null> {
  const snapshot = inspectSelectedDomTree(options.selectedElement ?? null);
  const markupContext = inspectSelectedMarkupContext(
    options.selectedElement ?? null,
  );

  if (!snapshot) {
    logger.warn(
      "Skipping UI spec generation because no DOM snapshot was available.",
    );
    return null;
  }

  const res = await browser.runtime.sendMessage({
    type: "command/create-ui",
    payload: {
      prompt: prompt.trim(),
      source,
      snapshot,
      markupContext: markupContext ?? undefined,
      data: options.data,
      screenshot,
      strategy: options.strategy,
    },
  } satisfies ExtensionRuntimeMessage);

  if (!res || !res?.data) {
    logger.error("Failed to return UI spec.");
  }

  return res?.data ?? null;
}

export async function detectUsabilityIssues(
  source: AugmentationRequest["source"],
  useRules: boolean,
  context?: UsabilityDetectionContext,
): Promise<UsabilityViolation[]> {
  const res = await browser.runtime.sendMessage({
    type: "command/detect-usability",
    payload: {
      source,
      useRules,
      rules: rulesSpec.rules,
      snapshot: context?.snapshot,
      screenshot: context?.screenshot,
    },
  } satisfies ExtensionRuntimeMessage);

  if (!res) {
    logger.error("Failed to run usability detection.");
    return [];
  }

  if (!res.data && res.error) {
    logger.error("Usability detection returned an error.", res.error);
  }

  return res.data ?? [];
}

export async function getUsabilityDetectionContext() {
  const res = await browser.runtime.sendMessage({
    type: "command/get-usability-context",
  } satisfies ExtensionRuntimeMessage);

  if (!res?.data) {
    logger.error("Failed to get usability detection context.", res?.error);
    return null;
  }

  return res.data as UsabilityDetectionContext;
}

export async function showUsabilityViolations(
  violations: UsabilityViolation[],
) {
  await browser.runtime.sendMessage({
    type: "usability/show-violations",
    payload: {
      violations,
    },
  } satisfies ExtensionRuntimeMessage);
}

export async function clearUsabilityViolations() {
  await browser.runtime.sendMessage({
    type: "usability/clear-violations",
  } satisfies ExtensionRuntimeMessage);
}
