import { settingsStore } from "../storage/settings-store";
import { logger } from "../utils/logger";
import { registerMessageRouter } from "./message-router";

export function initializeBackgroundRuntime() {
  browser.runtime.onInstalled.addListener(async (details) => {
    const settings = await settingsStore.get();
    logger.info("Extension installed or updated.", {
      reason: details.reason,
      settings,
    });
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
      return;
    }

    try {
      await browser.tabs.sendMessage(tab.id, {
        type: "floating-ui/open",
        payload: {
          source: "toolbar",
          selectedElement: null,
        },
      });
      logger.info("Requested in-page popup open from toolbar click.", {
        tabId: tab.id,
      });
    } catch (error) {
      logger.warn("Unable to open in-page popup from toolbar click.", {
        tabId: tab.id,
        error:
          error instanceof Error
            ? error.message
            : "Unknown tab messaging error",
      });
    }
  });

  // background.js
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE") {
      browser.tabs.captureVisibleTab(
        { format: "jpeg", quality: 30 },
        (dataUrl) => {
          sendResponse({ dataUrl });
        },
      );
      return true; // keeps the message channel open for the async response
    }
  });

  registerMessageRouter();
  logger.info("Background runtime initialized.");
}
