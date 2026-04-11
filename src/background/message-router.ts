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
