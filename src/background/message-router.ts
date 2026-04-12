import type { ExtensionRuntimeMessage } from "../types";
import { discoverAndStoreSchema } from "../schema/schema-service";
import { logger } from "../utils/logger";
import { commandHandler } from "./handlers/command";

export function registerMessageRouter() {
  browser.runtime.onMessage.addListener(
    (message: ExtensionRuntimeMessage, _, sendResponse) => {
      logger.info("Background received message.", message);

      switch (message.type) {
        case "command/submit":
          commandHandler()
            .submit(message.payload)
            .then((res) => sendResponse({ data: res }))
            .catch((err) => sendResponse({ error: err }));
          return true;
        case "command/create-ui":
          commandHandler()
            .createUi(message.payload)
            .then((res) => sendResponse({ data: res }))
            .catch((err) => sendResponse({ error: err }));
          return true;
        case "augmentation/inject":
          browser.tabs
            .query({ active: true, currentWindow: true })
            .then(async (tabs) => {
              const activeTabId = tabs[0]?.id;

              if (!activeTabId) {
                sendResponse({
                  ok: false,
                  handled: false,
                  error: "No active tab found for augmentation injection.",
                });
                return;
              }

              await browser.tabs.sendMessage(activeTabId, message);
              sendResponse({ ok: true, handled: true });
            })
            .catch((err) =>
              sendResponse({
                ok: false,
                handled: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          return true;
        case "schema/discover":
          return discoverAndStoreSchema(message.payload);
        case "selection/toggle":
          return {
            ok: true,
            handled: true,
            enabled: message.payload.enabled,
          };
        case "floating-ui/open":
        case "floating-ui/close":
          return {
            ok: true,
            handled: true,
            note: "Floating UI messages are handled directly inside the content script.",
          };
        default:
          return {
            ok: false,
            handled: false,
          };
      }
    },
  );
}
