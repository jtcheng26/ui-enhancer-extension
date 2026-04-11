import type { AugmentationRequest, SelectedElement } from "../types";
import { requestStore } from "../storage/request-store";
import { settingsStore } from "../storage/settings-store";
import { logger } from "../utils/logger";
import { inspectSelectedDomTree } from "./dom-inspection-service";
import { DOMExtractorSpec } from "./dom-extractor";

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

  // const res = null;

  console.log(res);

  if (!res || !res?.data) logger.error("Failed to return spec.");
  return res?.data ?? null;
}
