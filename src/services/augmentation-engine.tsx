import ReactDOM from "react-dom/client";
import type {
  InjectedAugmentation,
  PersistedAugmentation,
  PersistedAugmentationStore,
} from "../types";
import { logger } from "../utils/logger";
import type { ContentScriptContext, ShadowRootContentScriptUi } from "#imports";
import {
  ActionProvider,
  createStateStore,
  Renderer,
  StateProvider,
  type StateStore,
  VisibilityProvider,
} from "@json-render/react";
import { flattenToPointers } from "@json-render/core/store-utils";
import { registry } from "@/ai/ui/catalog";
import {
  DOMExtractorSpec,
  type ExtractedValue,
  validateAndParse,
} from "./dom-extractor";
import {
  RENDER_SYSTEMS,
  RenderSystem,
  RenderSystemId,
  RenderUpdater,
} from "./renderer/renderer";

function applyPlaceholderStyles(element: HTMLDivElement) {
  Object.assign(element.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483644",
    maxWidth: "280px",
    padding: "12px 14px",
    border: "1px solid rgba(29, 35, 48, 0.16)",
    borderRadius: "16px",
    background: "rgba(255, 250, 241, 0.96)",
    boxShadow: "0 16px 36px rgba(50, 50, 93, 0.16)",
    color: "#1d2330",
    fontFamily: "'IBM Plex Sans', 'Avenir Next', 'Segoe UI', sans-serif",
  });
}

interface MountedAugmentation {
  augmentation: InjectedAugmentation;
  extractor?: DOMExtractorSpec;
  spec?: string;
  renderSystemId: RenderSystemId;
  renderUpdater?: RenderUpdater;
  lastScrapedData?: Record<string, ExtractedValue>;
  originalElement?: HTMLElement;
  renderedElement?: HTMLElement | null;
  originalDisplay?: string;
  originalAriaHidden?: string | null;
  usesBodyWrapper?: boolean;
  ui?: ShadowRootContentScriptUi<{ root: ReactDOM.Root }>;
  teardown: () => void;
}

const BODY_CONTENT_WRAPPER_SELECTOR = "[data-aui-body-content-wrapper]";
const BODY_CONTENT_WRAPPER_COUNT_ATTR = "data-aui-body-content-wrapper-count";

function isPlainObject(
  value: unknown,
): value is Record<string, ExtractedValue | undefined> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function areExtractedValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => areExtractedValuesEqual(value, b[index]));
  }

  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => areExtractedValuesEqual(a[key], b[key]));
}

function createStoreUpdates(
  previousState: Record<string, unknown>,
  nextState: Record<string, ExtractedValue>,
) {
  const previousPointers = flattenToPointers(previousState);
  const nextPointers = flattenToPointers(nextState);
  const updates: Record<string, unknown> = {};

  for (const path of new Set([
    ...Object.keys(previousPointers),
    ...Object.keys(nextPointers),
  ])) {
    const previousValue = previousPointers[path];
    const nextValue = nextPointers[path];

    if (path in nextPointers) {
      if (!areExtractedValuesEqual(previousValue, nextValue)) {
        updates[path] = nextValue;
      }
    } else {
      updates[path] = undefined;
    }
  }

  return updates;
}

async function waitForDraftRenderPaint() {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
}

export class AugmentationEngine {
  private readonly augmentations = new Map<string, InjectedAugmentation>();
  private readonly mountedAugmentations = new Map<
    string,
    MountedAugmentation
  >();
  private readonly injectionOrder: string[] = [];
  private readonly previewOverlay = document.createElement("div");
  private persistedAugmentationObserver?: MutationObserver;
  private persistedAugmentationObserverFrame: number | null = null;
  private highlightedAugmentationId: string | null = null;

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly root: Document,
    private readonly persistedAugmentationStore: PersistedAugmentationStore,
  ) {
    this.configurePreviewOverlay();
    this.root.body.append(this.previewOverlay);
  }

  async inject(
    extractor: DOMExtractorSpec,
    spec: string,
    renderSystemId: RenderSystemId,
    persistedId?: string,
  ) {
    const id = persistedId ?? crypto.randomUUID();
    const shadowRootName = `augmentation_${id}`;
    if (document.querySelector(shadowRootName)) return null;

    const { data, root: replacedElement } = validateAndParse(extractor);
    if (replacedElement instanceof Document) {
      console.error("Replaced element is root");
      this.augmentations.delete(id);
      return null;
    }

    if (!data) {
      console.error("Initial data not found");
      this.augmentations.delete(id);
      return null;
    }

    if (!(replacedElement instanceof HTMLElement)) {
      logger.warn(
        "Unable to inject augmentation because no root element was resolved.",
        {
          extractor,
        },
      );
      this.augmentations.delete(id);
      return null;
    }

    const usesBodyWrapper = replacedElement === this.root.body;
    const hiddenElement = usesBodyWrapper
      ? this.acquireBodyContentWrapper()
      : replacedElement;
    const originalDisplay = hiddenElement.style.display;
    const originalAriaHidden = hiddenElement.getAttribute("aria-hidden");
    const mountAnchor = this.root.createElement("div");
    const label = extractor.root.output;

    const temp = document.createElement(shadowRootName);
    temp.id = shadowRootName;
    // avoid race condition during createShadowRootUi coroutine
    document.body.appendChild(temp);

    const containerId = `aui-augmentation-${id}`;
    mountAnchor.id = containerId;
    if (usesBodyWrapper) {
      this.root.body.appendChild(mountAnchor);
    } else {
      replacedElement.insertAdjacentElement("afterend", mountAnchor);
    }
    hiddenElement.style.display = "none";
    hiddenElement.setAttribute("aria-hidden", "true");

    let ui: ShadowRootContentScriptUi<{ root: ReactDOM.Root }> | undefined;
    let renderUpdater: RenderUpdater | undefined;

    try {
      ui = await createShadowRootUi(this.ctx, {
        name: shadowRootName,
        position: "inline",
        anchor: mountAnchor,
        append: "replace",

        onMount: (uiContainer) => {
          const root = ReactDOM.createRoot(uiContainer);
          renderUpdater = RENDER_SYSTEMS[renderSystemId].render(
            root,
            data,
            spec,
            uiContainer,
            persistedId,
          );

          return { root };
        },
        onRemove: (mounted) => {
          mounted?.root.unmount();
        },
      });
      ui.mount();
    } catch (error) {
      if (usesBodyWrapper) {
        this.releaseBodyContentWrapper();
      } else {
        hiddenElement.style.display = originalDisplay;

        if (originalAriaHidden === null) {
          hiddenElement.removeAttribute("aria-hidden");
        } else {
          hiddenElement.setAttribute("aria-hidden", originalAriaHidden);
        }
      }

      mountAnchor.remove();
      logger.error("Failed to inject augmentation.", error);
      this.augmentations.delete(id);
      document.getElementById(shadowRootName)?.remove();
      return null;
    }

    const augmentation: InjectedAugmentation = {
      id,
      kind: "overlay",
      label,
      containerId,
      createdAt: new Date().toISOString(),
      status: "injected",
    };

    this.augmentations.set(augmentation.id, augmentation);
    this.mountedAugmentations.set(augmentation.id, {
      augmentation,
      extractor,
      spec,
      renderSystemId,
      renderUpdater,
      lastScrapedData: data,
      originalElement: hiddenElement,
      renderedElement:
        mountAnchor.nextElementSibling instanceof HTMLElement
          ? mountAnchor.nextElementSibling
          : null,
      originalDisplay,
      originalAriaHidden,
      usesBodyWrapper,
      ui,
      teardown: () => {
        ui?.remove();
      },
    });
    this.injectionOrder.push(augmentation.id);
    logger.info(
      "Injected augmentation while preserving the original element.",
      {
        augmentation,
        selector: extractor.root.selector,
      },
    );
    document.getElementById(shadowRootName)?.remove();

    return augmentation;
  }

  async renderDraftForScreenshot<T>(
    extractor: DOMExtractorSpec,
    spec: string,
    renderSystemId: RenderSystemId,
    capture: (element: HTMLElement) => Promise<T>,
  ) {
    const id = crypto.randomUUID();
    const shadowRootName = `draft-preview-${id}`;
    const { data, root: replacedElement } = validateAndParse(extractor);

    if (!data || !(replacedElement instanceof HTMLElement)) {
      throw new Error("Unable to render draft because the extractor did not resolve.");
    }

    const usesBodyWrapper = replacedElement === this.root.body;
    const hiddenElement = usesBodyWrapper
      ? this.acquireBodyContentWrapper()
      : replacedElement;
    const originalDisplay = hiddenElement.style.display;
    const originalAriaHidden = hiddenElement.getAttribute("aria-hidden");
    const mountAnchor = this.root.createElement("div");
    let ui: ShadowRootContentScriptUi<{ root: ReactDOM.Root }> | undefined;

    if (usesBodyWrapper) {
      this.root.body.appendChild(mountAnchor);
    } else {
      replacedElement.insertAdjacentElement("afterend", mountAnchor);
    }

    hiddenElement.style.display = "none";
    hiddenElement.setAttribute("aria-hidden", "true");

    try {
      ui = await createShadowRootUi(this.ctx, {
        name: shadowRootName,
        position: "inline",
        anchor: mountAnchor,
        append: "replace",
        onMount: (uiContainer) => {
          const root = ReactDOM.createRoot(uiContainer);
          RENDER_SYSTEMS[renderSystemId].render(root, data, spec, uiContainer);
          return { root };
        },
        onRemove: (mounted) => {
          mounted?.root.unmount();
        },
      });

      ui.mount();
      ui.shadowHost.style.display = "block";
      await waitForDraftRenderPaint();
      return await capture(ui.shadowHost);
    } finally {
      ui?.remove();

      if (usesBodyWrapper) {
        this.releaseBodyContentWrapper();
      } else {
        hiddenElement.style.display = originalDisplay;

        if (originalAriaHidden === null) {
          hiddenElement.removeAttribute("aria-hidden");
        } else {
          hiddenElement.setAttribute("aria-hidden", originalAriaHidden);
        }
      }

      mountAnchor.remove();
    }
  }

  highlightAugmentation(id: string) {
    const mountedAugmentation = this.mountedAugmentations.get(id);
    const targetElement =
      mountedAugmentation?.renderedElement ??
      mountedAugmentation?.originalElement ??
      null;

    if (!targetElement) {
      this.clearHighlightedAugmentation();
      return false;
    }

    const rect = targetElement.getBoundingClientRect();
    this.previewOverlay.style.display = "block";
    this.previewOverlay.style.top = `${rect.top}px`;
    this.previewOverlay.style.left = `${rect.left}px`;
    this.previewOverlay.style.width = `${rect.width}px`;
    this.previewOverlay.style.height = `${rect.height}px`;
    this.highlightedAugmentationId = id;
    return true;
  }

  clearHighlightedAugmentation() {
    this.highlightedAugmentationId = null;
    this.previewOverlay.style.display = "none";
    this.previewOverlay.style.width = "0";
    this.previewOverlay.style.height = "0";
  }

  async undoMostRecentAugmentation() {
    const recentAugmentationId = [...this.injectionOrder]
      .reverse()
      .find((id) => this.augmentations.has(id));

    if (!recentAugmentationId) {
      return false;
    }

    return this.remove(recentAugmentationId);
  }

  async persistAugmentation(id: string) {
    const augmentation = this.mountedAugmentations.get(id);

    if (!augmentation?.extractor || !augmentation.spec) {
      logger.warn(
        "Unable to persist augmentation because it does not have extractor/spec metadata.",
        {
          id,
        },
      );
      return null;
    }

    const persistedAugmentation: PersistedAugmentation = {
      id: augmentation.augmentation.id,
      label: augmentation.augmentation.label,
      pageUrl: window.location.href,
      enabled: true,
      extractor: augmentation.extractor,
      spec: augmentation.spec,
      renderSystemId: augmentation.renderSystemId,
      createdAt: augmentation.augmentation.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.persistedAugmentationStore.upsert(persistedAugmentation);
    logger.info(
      "Persisted augmentation to local storage.",
      persistedAugmentation,
    );
    return persistedAugmentation;
  }

  async injectPersistedAugmentations() {
    const persistedAugmentations = (
      await this.persistedAugmentationStore.list()
    ).filter(
      (augmentation) =>
        augmentation.enabled && augmentation.pageUrl === window.location.href,
    );
    const injectedAugmentations: InjectedAugmentation[] = [];

    for (const persistedAugmentation of persistedAugmentations) {
      const injectedAugmentation = await this.inject(
        persistedAugmentation.extractor,
        persistedAugmentation.spec,
        persistedAugmentation.renderSystemId,
        persistedAugmentation.id,
      );

      if (injectedAugmentation) {
        injectedAugmentations.push(injectedAugmentation);
      }
    }

    return injectedAugmentations;
  }

  observePersistedAugmentations() {
    if (this.persistedAugmentationObserver) {
      return this.persistedAugmentationObserver;
    }

    const scheduleInjection = () => {
      if (this.persistedAugmentationObserverFrame !== null) {
        return;
      }

      this.persistedAugmentationObserverFrame = window.requestAnimationFrame(
        () => {
          this.persistedAugmentationObserverFrame = null;
          void this.syncPersistedAugmentations();
        },
      );
    };

    const observer = new MutationObserver(() => {
      scheduleInjection();
    });

    observer.observe(this.root.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    this.persistedAugmentationObserver = observer;
    scheduleInjection();
    return observer;
  }

  private async syncPersistedAugmentations() {
    this.refreshMountedAugmentationData();
    await this.injectPersistedAugmentations();
  }

  private refreshMountedAugmentationData() {
    for (const mountedAugmentation of this.mountedAugmentations.values()) {
      if (!mountedAugmentation.extractor) {
        continue;
      }

      const { data } = validateAndParse(mountedAugmentation.extractor);
      if (!data) {
        continue;
      }

      const previousScrapedData = mountedAugmentation.lastScrapedData ?? {};
      if (areExtractedValuesEqual(previousScrapedData, data)) {
        continue;
      }

      const updates = createStoreUpdates(previousScrapedData, data);
      if (Object.keys(updates).length === 0) {
        continue;
      }

      mountedAugmentation.renderUpdater?.update(data);
      mountedAugmentation.lastScrapedData = data;
      logger.info("Updated augmentation renderer state after DOM re-scrape.", {
        id: mountedAugmentation.augmentation.id,
      });
    }
  }

  list() {
    return Array.from(this.augmentations.values());
  }

  remove(id: string) {
    const augmentation = this.augmentations.get(id);
    if (!augmentation) {
      return false;
    }

    const mountedAugmentation = this.mountedAugmentations.get(id);
    mountedAugmentation?.teardown();

    if (this.highlightedAugmentationId === id) {
      this.clearHighlightedAugmentation();
    }

    if (mountedAugmentation?.originalElement) {
      if (mountedAugmentation.usesBodyWrapper) {
        this.releaseBodyContentWrapper();
      } else {
        mountedAugmentation.originalElement.style.display =
          mountedAugmentation.originalDisplay ?? "";

        if (mountedAugmentation.originalAriaHidden == null) {
          mountedAugmentation.originalElement.removeAttribute("aria-hidden");
        } else {
          mountedAugmentation.originalElement.setAttribute(
            "aria-hidden",
            mountedAugmentation.originalAriaHidden,
          );
        }
      }
    } else {
      this.root.getElementById(augmentation.containerId)?.remove();
    }

    augmentation.status = "removed";
    this.augmentations.delete(id);
    this.mountedAugmentations.delete(id);
    const orderIndex = this.injectionOrder.lastIndexOf(id);
    if (orderIndex !== -1) {
      this.injectionOrder.splice(orderIndex, 1);
    }
    return true;
  }

  destroy() {
    if (this.persistedAugmentationObserver) {
      this.persistedAugmentationObserver.disconnect();
      this.persistedAugmentationObserver = undefined;
    }

    if (this.persistedAugmentationObserverFrame !== null) {
      window.cancelAnimationFrame(this.persistedAugmentationObserverFrame);
      this.persistedAugmentationObserverFrame = null;
    }

    this.clearHighlightedAugmentation();
    this.previewOverlay.remove();
    this.list().forEach((item) => this.remove(item.id));
  }

  private configurePreviewOverlay() {
    this.previewOverlay.setAttribute("data-aui-overlay", "true");

    Object.assign(this.previewOverlay.style, {
      boxSizing: "border-box",
      pointerEvents: "none",
      position: "fixed",
      zIndex: "2147483646",
      borderRadius: "12px",
      border: "2px solid rgba(255, 117, 47, 0.95)",
      background: "rgba(255, 117, 47, 0.12)",
      display: "none",
      width: "0",
      height: "0",
      transition: "transform 80ms ease, width 80ms ease, height 80ms ease",
    });
  }

  private getBodyContentWrapper() {
    const wrapper = this.root.body.querySelector(BODY_CONTENT_WRAPPER_SELECTOR);
    return wrapper instanceof HTMLDivElement ? wrapper : null;
  }

  private acquireBodyContentWrapper() {
    let wrapper = this.getBodyContentWrapper();

    if (!wrapper) {
      wrapper = this.root.createElement("div");
      wrapper.setAttribute("data-aui-body-content-wrapper", "true");

      const childNodes = Array.from(this.root.body.childNodes);
      this.root.body.prepend(wrapper);

      for (const childNode of childNodes) {
        if (childNode === wrapper) {
          continue;
        }

        if (
          childNode instanceof HTMLElement &&
          (childNode.matches("ai-ui-floating-popup, [data-aui-overlay]") ||
            childNode.tagName.toLowerCase().startsWith("augmentation_"))
        ) {
          continue;
        }

        wrapper.appendChild(childNode);
      }
    }

    const currentCount = Number(
      wrapper.getAttribute(BODY_CONTENT_WRAPPER_COUNT_ATTR) ?? "0",
    );
    wrapper.setAttribute(
      BODY_CONTENT_WRAPPER_COUNT_ATTR,
      String(currentCount + 1),
    );

    return wrapper;
  }

  private releaseBodyContentWrapper() {
    const wrapper = this.getBodyContentWrapper();
    if (!wrapper) {
      return;
    }

    const currentCount = Number(
      wrapper.getAttribute(BODY_CONTENT_WRAPPER_COUNT_ATTR) ?? "1",
    );

    if (currentCount > 1) {
      wrapper.setAttribute(
        BODY_CONTENT_WRAPPER_COUNT_ATTR,
        String(currentCount - 1),
      );
      return;
    }

    wrapper.removeAttribute(BODY_CONTENT_WRAPPER_COUNT_ATTR);
    wrapper.style.display = "";
    wrapper.removeAttribute("aria-hidden");

    while (wrapper.firstChild) {
      this.root.body.insertBefore(wrapper.firstChild, wrapper);
    }

    wrapper.remove();
  }
}
