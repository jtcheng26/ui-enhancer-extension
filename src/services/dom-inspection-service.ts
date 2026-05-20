import type {
  MarkupStyleSnapshot,
  SelectedMarkupContext,
  SelectedDomTreeSnapshot,
  SelectedElement,
  UsabilityDetectionContext,
} from "../types";
import { logger } from "../utils/logger";
import { formatSnapshotPrompt, serializeAccessibilityTree } from "./snapshot";
import { buildElementSelector } from "./selector";

const MARKUP_ALLOWED_ATTRIBUTES = new Set([
  "id",
  "class",
  "role",
  "href",
  "src",
  "alt",
  "title",
  "type",
  "name",
  "value",
  "placeholder",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-expanded",
  "aria-selected",
  "aria-checked",
  "data-testid",
  "data-test",
  "data-qa",
  "data-cy",
]);

const MARKUP_STYLE_PROPERTIES = [
  "display",
  "position",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "padding",
  "margin",
  "width",
  "height",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "color",
  "background-color",
  "border",
  "border-radius",
  "box-shadow",
] as const;

const MAX_MARKUP_HTML_LENGTH = 9000;
const MAX_MARKUP_STYLE_SNAPSHOTS = 16;
const MAX_MARKUP_STYLE_JSON_LENGTH = 5000;
const MAX_MARKUP_DESCENDANTS = 40;
const SCREENSHOT_SETTLE_DELAY_MS = 180;

function isExtensionUiOrUnsafeElement(element: Element): boolean {
  return (
    element.matches("script, style, noscript, template") ||
    element.matches("ai-ui-floating-popup, [data-aui-overlay]") ||
    element.classList.contains("aui-injected-placeholder")
  );
}

function sanitizeMarkupClone(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  const allElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
  let keptDescendants = 0;

  for (const element of allElements) {
    if (isExtensionUiOrUnsafeElement(element)) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      if (!MARKUP_ALLOWED_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element !== clone) {
      keptDescendants += 1;

      if (keptDescendants > MAX_MARKUP_DESCENDANTS) {
        element.replaceWith(
          clone.ownerDocument.createComment("truncated subtree"),
        );
      }
    }
  }

  return clone;
}

function clipHtmlSnippet(html: string): string {
  if (html.length <= MAX_MARKUP_HTML_LENGTH) {
    return html;
  }

  return `${html.slice(0, MAX_MARKUP_HTML_LENGTH)}<!-- truncated html -->`;
}

function getStyleSnapshotForElement(element: HTMLElement): MarkupStyleSnapshot {
  const computedStyle = window.getComputedStyle(element);
  const styles = MARKUP_STYLE_PROPERTIES.reduce<Record<string, string>>(
    (result, propertyName) => {
      const value = computedStyle.getPropertyValue(propertyName).trim();

      if (value) {
        result[propertyName] = value;
      }

      return result;
    },
    {},
  );

  return {
    selector: buildElementSelector(element, element.ownerDocument),
    tagName: element.tagName.toLowerCase(),
    styles,
  };
}

function collectStyleSnapshots(root: HTMLElement): MarkupStyleSnapshot[] {
  const styleSnapshots: MarkupStyleSnapshot[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const element of elements) {
    if (styleSnapshots.length >= MAX_MARKUP_STYLE_SNAPSHOTS) {
      break;
    }

    if (isExtensionUiOrUnsafeElement(element)) {
      continue;
    }

    styleSnapshots.push(getStyleSnapshotForElement(element));

    if (JSON.stringify(styleSnapshots).length > MAX_MARKUP_STYLE_JSON_LENGTH) {
      styleSnapshots.pop();
      break;
    }
  }

  return styleSnapshots;
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

export function inspectSelectedMarkupContext(
  selectedElement: SelectedElement | null,
  root: ParentNode = document,
): SelectedMarkupContext | null {
  if (!selectedElement) {
    return null;
  }

  const element = resolveSelectedElement(selectedElement, root);

  if (!element) {
    logger.warn(
      "Could not build markup context because the selected element was not found.",
      {
        selector: selectedElement.selector,
      },
    );
    return null;
  }

  const clone = sanitizeMarkupClone(element);

  return {
    selector: selectedElement.selector,
    html: clipHtmlSnippet(clone.outerHTML),
    styles: collectStyleSnapshots(element),
  };
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

async function waitForVisualSettle(delayMs = 0) {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function withElementsHidden<T>(
  elements: Iterable<Element>,
  fn: () => Promise<T>,
): Promise<T> {
  const hiddenElements = Array.from(elements).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  const originalStyles = new Map<
    HTMLElement,
    { visibility: string; display: string }
  >();

  for (const element of hiddenElements) {
    originalStyles.set(element, {
      visibility: element.style.visibility,
      display: element.style.display,
    });
    element.style.visibility = "hidden";
    element.style.display = "none";
  }

  if (hiddenElements.length > 0) {
    await waitForVisualSettle(SCREENSHOT_SETTLE_DELAY_MS);
  }

  try {
    return await fn();
  } finally {
    for (const [element, originalStyle] of originalStyles) {
      element.style.visibility = originalStyle.visibility;
      element.style.display = originalStyle.display;
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
  await waitForVisualSettle(SCREENSHOT_SETTLE_DELAY_MS);

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
