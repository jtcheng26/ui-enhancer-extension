import type { ContentScriptContext } from "#imports";

import type { ExtensionRuntimeMessage } from "../types";
import { persistedAugmentationStore } from "../storage/persisted-augmentation-store";
import { settingsStore } from "../storage/settings-store";
import { AugmentationEngine } from "../services/augmentation-engine";
import { logger } from "../utils/logger";
import { ClickSelectController } from "./click-select";
import { FloatingPopupController } from "./floating-popup-controller";
import { HoverHighlighter } from "./hover-highlighter";
import { SelectionOverlayRenderer } from "./selection-overlay";
import { SelectionStateManager } from "./selection-state";
import { jsonRenderSystemPrompt } from "@/ai/ui/prompt";

export async function initializeContentPrototype(ctx: ContentScriptContext) {
  const settings = await settingsStore.get();
  const overlay = new SelectionOverlayRenderer();
  const state = new SelectionStateManager();
  const augmentationEngine = new AugmentationEngine(
    ctx,
    document,
    persistedAugmentationStore,
  );
  augmentationEngine.observePersistedAugmentations();
  const floatingPopup = new FloatingPopupController(ctx, augmentationEngine);

  const highlighter = new HoverHighlighter({
    overlay,
    onHover(selectedElement) {
      // logger.info("Hovered element placeholder event.", {
      //   selector: selectedElement.selector,
      // });
    },
  });

  const clickSelector = new ClickSelectController({
    overlay,
    state,
    onSelect(selectedElement) {
      logger.info("Selected element placeholder event.", selectedElement);
      void floatingPopup.open({
        selectedElement,
      });
    },
  });

  const handleRuntimeMessage = (
    message: ExtensionRuntimeMessage,
    _: any,
    sendResponse: (response?: any) => void,
  ) => {
    if (message.type === "floating-ui/open") {
      void floatingPopup.open({
        selectedElement: message.payload?.selectedElement ?? null,
      });
    }

    if (message.type === "floating-ui/close") {
      floatingPopup.close();
    }

    if (message.type === "augmentation/inject") {
      (async () => {
        try {
          void (await augmentationEngine.inject(
            message.payload.extractor,
            message.payload.spec,
            message.payload.renderSystemId,
          ));
          sendResponse({ ok: true });
        } catch (e) {
          console.error(e);
          sendResponse({ ok: false });
        }
      })();

      return true;
    }
  };

  browser.runtime.onMessage.addListener(handleRuntimeMessage);

  state.subscribe((selectedElement) => {
    logger.info("Selection state changed.", selectedElement);
  });

  const applyInteractionSettings = (nextSettings: typeof settings) => {
    if (nextSettings.selectionModeEnabled) {
      highlighter.start();
    } else {
      highlighter.stop();
    }

    if (nextSettings.selectionModeEnabled) {
      clickSelector.enable();
    } else {
      clickSelector.disable();
    }
  };

  applyInteractionSettings(settings);

  const unsubscribeFromSettings = settingsStore.subscribe((nextSettings) => {
    applyInteractionSettings(nextSettings);
    logger.info("Updated content interaction settings from popup.", {
      selectionModeEnabled: nextSettings.selectionModeEnabled,
    });
  });

  logger.info("Content prototype initialized.", {
    pageUrl: window.location.href,
    settings,
  });

  return () => {
    browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    unsubscribeFromSettings();
    floatingPopup.destroy();
    highlighter.stop();
    clickSelector.disable();
    overlay.destroy();
    augmentationEngine.destroy();
  };
}
