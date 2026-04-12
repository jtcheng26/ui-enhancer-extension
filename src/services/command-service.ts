import type { AugmentationRequest, SelectedElement } from "../types";
import { requestStore } from "../storage/request-store";
import { settingsStore } from "../storage/settings-store";
import { logger } from "../utils/logger";
import { injectViaRegisteredAugmentation } from "../content/augmentation-injector";
import { inspectSelectedDomTree } from "./dom-inspection-service";
import { DOMExtractorSpec, ExtractedValue } from "./dom-extractor";
import type { UISpec } from "../ai/providers/ai-provider";

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

  if (!res || !res?.data) logger.error("Failed to return spec.");
  return res?.data ?? null;
}

interface CreateUiSpecOptions {
  selectedElement?: SelectedElement | null;
  data: Record<string, ExtractedValue>;
}

export async function createUiSpec(
  prompt: string,
  source: AugmentationRequest["source"],
  options: CreateUiSpecOptions,
): Promise<UISpec | null> {
  const snapshot = inspectSelectedDomTree(options.selectedElement ?? null);

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
      data: options.data,
    },
  });

  if (!res || !res?.data) {
    logger.error("Failed to return UI spec.");
  }

  return res?.data ?? null;
}

export async function injectAugmentation(
  selectedElement: SelectedElement | null,
  spec: UISpec,
) {
  if (!selectedElement) {
    logger.warn(
      "Skipping augmentation inject because no selected element was provided.",
    );
    return;
  }

  const injectedLocally = await injectViaRegisteredAugmentation(
    selectedElement.selector,
    spec,
  );

  if (injectedLocally) {
    return;
  }

  const res = await browser.runtime.sendMessage({
    type: "augmentation/inject",
    payload: {
      selectedElement,
      spec,
    },
  });

  if (!res?.ok) {
    logger.warn("Failed to inject augmentation.", res);
  }
}
