import type { ExtensionRuntimeMessage } from "../types";
import { discoverAndStoreSchema } from "../schema/schema-service";
import { logger } from "../utils/logger";
import { commandHandler } from "./handlers/command";

async function sendMessageToActiveTab(message: ExtensionRuntimeMessage) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTabId = tabs[0]?.id;

  if (!activeTabId) {
    throw new Error("No active tab found.");
  }

  return browser.tabs.sendMessage(activeTabId, message);
}

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
        case "command/get-usability-context":
          sendMessageToActiveTab({ type: "usability/get-context" })
            .then((res) => {
              if (!res?.data) {
                throw new Error("No page context returned for usability scan.");
              }

              sendResponse({ data: res.data });
            })
            .catch((err) =>
              sendResponse({
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          return true;
        case "command/detect-usability":
          Promise.resolve(
            message.payload.snapshot && message.payload.screenshot
              ? {
                  snapshot: message.payload.snapshot,
                  screenshot: message.payload.screenshot,
                }
              : sendMessageToActiveTab({ type: "usability/get-context" }).then(
                  (res) => {
                    if (!res?.data) {
                      throw new Error(
                        "No page context returned for usability scan.",
                      );
                    }

                    return res.data;
                  },
                ),
          )
            .then((context) =>
              commandHandler().detectUsabilityIssues({
                ...message.payload,
                ...context,
              }),
            )
            .then((res) => sendResponse({ data: res }))
            .catch((err) =>
              sendResponse({
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          return true;
        case "augmentation/inject":
        case "usability/show-violations":
        case "usability/clear-violations":
          sendMessageToActiveTab(message)
            .then(() => sendResponse({ ok: true, handled: true }))
            .catch((err) =>
              sendResponse({
                ok: false,
                handled: false,
                error:
                  err instanceof Error
                    ? err.message
                    : String(err),
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
        case "usability/get-context":
        case "floating-ui/open":
        case "floating-ui/close":
          return {
            ok: true,
            handled: true,
            note: "This message is handled directly inside the content script.",
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
