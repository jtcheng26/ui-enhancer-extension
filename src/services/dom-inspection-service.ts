import type {
  SelectedDomTreeSnapshot,
  SelectedElement,
  UsabilityDetectionContext,
} from "../types";
import { logger } from "../utils/logger";
import { formatSnapshotPrompt, serializeAccessibilityTree } from "./snapshot";

export function resolveSelectedElement(
  selectedElement: SelectedElement,
  root: ParentNode = document,
) {
  try {
    return root.querySelector<HTMLElement>(selectedElement.selector);
  } catch (error) {
    logger.warn(
      "Failed to resolve selected element selector for DOM snapshot.",
      {
        selector: selectedElement.selector,
        error,
      },
    );
    return null;
  }
}

export function inspectSelectedDomTree(
  selectedElement: SelectedElement | null,
  root: ParentNode = document,
) {
  if (!selectedElement) {
    return null;
  }

  const element = document.body; // resolveSelectedElement(selectedElement, root);

  if (!element) {
    logger.warn(
      "Could not build DOM snapshot because the selected element was not found.",
      {
        selector: selectedElement.selector,
      },
    );
    return null;
  }

  const tree = serializeAccessibilityTree(element);

  const snapshot: SelectedDomTreeSnapshot = {
    selectedElementId: selectedElement.id,
    selector: selectedElement.selector,
    pageUrl: selectedElement.pageUrl,
    tree,
    prompt: formatSnapshotPrompt(selectedElement.selector, tree),
  };

  // logger.info(
  //   "Stubbed DOM tree snapshot for augmentation request.",
  //   JSON.stringify(snapshot),
  // );

  return snapshot;
}

export function inspectPageDomTree(
  root: ParentNode = document,
): SelectedDomTreeSnapshot | null {
  const doc = root instanceof Document ? root : document;
  const element = doc.body;

  if (!element) {
    logger.warn("Could not build page accessibility snapshot.");
    return null;
  }

  const tree = serializeAccessibilityTree(element);
  const selector = "body";

  return {
    selectedElementId: "page-root",
    selector,
    pageUrl: window.location.href,
    tree,
    prompt: formatSnapshotPrompt(selector, tree),
  };
}

function getCaptureDataUrl() {
  return browser.runtime.sendMessage({ type: "CAPTURE" }).then((res) => {
    if (!res?.dataUrl) {
      throw new Error("Failed to capture the current page screenshot.");
    }

    return res.dataUrl as string;
  });
}

function getExtensionUiElements(root: ParentNode = document): HTMLElement[] {
  const doc = root instanceof Document ? root : document;

  return Array.from(
    doc.querySelectorAll<HTMLElement>(
      "ai-ui-floating-popup, [data-aui-overlay], .aui-injected-placeholder",
    ),
  );
}

export async function withElementsHidden<T>(
  elements: Iterable<Element>,
  fn: () => Promise<T>,
): Promise<T> {
  const hiddenElements = Array.from(elements).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  const originalVisibilities = new Map<HTMLElement, string>();

  for (const element of hiddenElements) {
    originalVisibilities.set(element, element.style.visibility);
    element.style.visibility = "hidden";
  }

  if (hiddenElements.length > 0) {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }

  try {
    return await fn();
  } finally {
    for (const [element, originalVisibility] of originalVisibilities) {
      element.style.visibility = originalVisibility;
    }
  }
}

export async function withElementHidden<T>(
  element: Element,
  fn: () => Promise<T>,
): Promise<T> {
  return withElementsHidden([element], fn);
}

export async function captureVisiblePageScreenshot() {
  const dataUrl = await getCaptureDataUrl();
  return dataUrl.replace(/^data:image\/\w+;base64,/, "");
}

export async function getUsabilityDetectionContext(
  root: ParentNode = document,
): Promise<UsabilityDetectionContext | null> {
  const snapshot = inspectPageDomTree(root);

  if (!snapshot) {
    return null;
  }

  const screenshot = await withElementsHidden(
    getExtensionUiElements(root),
    captureVisiblePageScreenshot,
  );

  return {
    snapshot,
    screenshot,
  };
}

export async function screenshotElement(element: Element) {
  // element.scrollIntoView({ behavior: "instant", block: "center" });
  await new Promise((r) => setTimeout(r, 150));

  const dataUrl = await getCaptureDataUrl();

  const rect = element.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  canvas
    .getContext("2d")
    ?.drawImage(
      img,
      rect.left * dpr,
      rect.top * dpr,
      rect.width * dpr,
      rect.height * dpr,
      0,
      0,
      canvas.width,
      canvas.height,
    );

  return canvas
    .toDataURL("image/jpeg", 0.2)
    .replace(/^data:image\/\w+;base64,/, "");
}
