import type {
  JsonifiedDomNode,
  SelectedDomTreeSnapshot,
  SelectedElement,
} from "../types";
import { logger } from "../utils/logger";

const MAX_TREE_DEPTH = 15;
const MAX_CHILDREN_PER_NODE = 25;
const MAX_TEXT_PREVIEW_LENGTH = 140;

function getOwnText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((n): n is Text => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim() || "")
    .filter(Boolean)
    .join(" ");
}

function mapAttributes(element: HTMLElement) {
  return Array.from(element.attributes).reduce<Record<string, string>>(
    (result, attribute) => {
      result[attribute.name] = attribute.value;
      return result;
    },
    {},
  );
}

function getTextPreview(element: HTMLElement): string {
  const ownText = getOwnText(element);

  return ownText.slice(0, MAX_TEXT_PREVIEW_LENGTH);
}

function serializeDomNode(
  element: HTMLElement,
  currentDepth = 0,
): JsonifiedDomNode {
  const childElements = Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );

  if (currentDepth >= MAX_TREE_DEPTH) {
    return {
      tagName: element.tagName.toLowerCase(),
      attributes: mapAttributes(element),
      textPreview: getTextPreview(element),
      childCount: childElements.length,
      children: [],
      isTruncated: childElements.length > 0,
    };
  }

  const limitedChildren = childElements.slice(0, MAX_CHILDREN_PER_NODE);

  return {
    tagName: element.tagName.toLowerCase(),
    attributes: mapAttributes(element),
    textPreview: getTextPreview(element),
    childCount: childElements.length,
    children: limitedChildren.map((child) =>
      serializeDomNode(child, currentDepth + 1),
    ),
    isTruncated: childElements.length > limitedChildren.length,
  };
}

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

  const element = resolveSelectedElement(selectedElement, root);

  if (!element) {
    logger.warn(
      "Could not build DOM snapshot because the selected element was not found.",
      {
        selector: selectedElement.selector,
      },
    );
    return null;
  }

  const snapshot: SelectedDomTreeSnapshot = {
    selectedElementId: selectedElement.id,
    selector: selectedElement.selector,
    pageUrl: selectedElement.pageUrl,
    tree: serializeDomNode(element),
  };

  logger.info(
    "Stubbed DOM tree snapshot for augmentation request.",
    JSON.stringify(snapshot),
  );

  return snapshot;
}

export async function withElementHidden<T>(
  element: Element,
  fn: () => Promise<T>,
): Promise<T> {
  const el = element as HTMLElement;
  const original = el.style.visibility;
  el.style.visibility = "hidden";

  // Wait for browser to paint the hidden state
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );

  try {
    return await fn();
  } finally {
    el.style.visibility = original;
  }
}

export async function screenshotElement(element: Element) {
  // element.scrollIntoView({ behavior: "instant", block: "center" });
  await new Promise((r) => setTimeout(r, 150));

  const { dataUrl } = await browser.runtime.sendMessage({ type: "CAPTURE" });

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
