import ReactDOM from "react-dom/client";
import { UISpec } from "@/ai/providers/ai-provider";
import type {
  InjectedAugmentation,
  PersistedAugmentation,
  PersistedAugmentationStore,
} from "../types";
import { logger } from "../utils/logger";
import type { ContentScriptContext, ShadowRootContentScriptUi } from "#imports";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/ai/ui/catalog";
import { DOMExtractorSpec, validateAndParse } from "./dom-extractor";

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
  spec?: UISpec;
  originalElement?: HTMLElement;
  originalDisplay?: string;
  originalAriaHidden?: string | null;
  ui?: ShadowRootContentScriptUi<{ root: ReactDOM.Root }>;
  teardown: () => void;
}

export class AugmentationEngine {
  private readonly augmentations = new Map<string, InjectedAugmentation>();
  private readonly mountedAugmentations = new Map<
    string,
    MountedAugmentation
  >();
  private readonly injectionOrder: string[] = [];
  private persistedAugmentationObserver?: MutationObserver;
  private persistedAugmentationObserverFrame: number | null = null;

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly root: Document,
    private readonly persistedAugmentationStore: PersistedAugmentationStore,
  ) {}

  async inject(
    extractor: DOMExtractorSpec,
    spec: UISpec,
    persistedId?: string,
  ) {
    const id = persistedId ?? crypto.randomUUID();

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

    const originalDisplay = replacedElement.style.display;
    const originalAriaHidden = replacedElement.getAttribute("aria-hidden");
    const mountAnchor = this.root.createElement("div");
    const label = extractor.root.output;
    const shadowRootName = `augmentation_${id}`;
    const temp = document.createElement(shadowRootName);
    temp.id = shadowRootName;
    if (document.querySelector(shadowRootName)) return null;
    // avoid race condition during createShadowRootUi coroutine
    document.body.appendChild(temp);

    const containerId = `aui-augmentation-${id}`;
    mountAnchor.id = containerId;
    replacedElement.insertAdjacentElement("afterend", mountAnchor);
    replacedElement.style.display = "none";
    replacedElement.setAttribute("aria-hidden", "true");

    let ui: ShadowRootContentScriptUi<{ root: ReactDOM.Root }> | undefined;

    try {
      ui = await createShadowRootUi(this.ctx, {
        name: shadowRootName,
        position: "inline",
        anchor: mountAnchor,
        append: "replace",

        onMount: (uiContainer) => {
          const root = ReactDOM.createRoot(uiContainer);
          root.render(
            <StateProvider initialState={data}>
              <VisibilityProvider>
                <ActionProvider>
                  <Renderer spec={spec} registry={registry} />
                </ActionProvider>
              </VisibilityProvider>
            </StateProvider>,
          );

          return { root };
        },
        onRemove: (mounted) => {
          mounted?.root.unmount();
        },
      });
      ui.mount();
    } catch (error) {
      replacedElement.style.display = originalDisplay;

      if (originalAriaHidden === null) {
        replacedElement.removeAttribute("aria-hidden");
      } else {
        replacedElement.setAttribute("aria-hidden", originalAriaHidden);
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
      originalElement: replacedElement,
      originalDisplay,
      originalAriaHidden,
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
          void this.injectPersistedAugmentations();
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

    if (mountedAugmentation?.originalElement) {
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

    this.list().forEach((item) => this.remove(item.id));
  }

  // TODO: Add selector-aware rendering and transformation hooks.
}
