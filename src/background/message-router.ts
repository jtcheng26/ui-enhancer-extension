import type { ExtensionRuntimeMessage } from '../types';
import { discoverAndStoreSchema } from '../schema/schema-service';
import { logger } from '../utils/logger';

export function registerMessageRouter() {
  browser.runtime.onMessage.addListener(
    async (message: ExtensionRuntimeMessage) => {
      logger.info('Background received message.', message);

      switch (message.type) {
        case 'command/submit':
          return {
            ok: true,
            handled: true,
            note: 'Request received by mock background router.',
          };
        case 'schema/discover':
          return discoverAndStoreSchema(message.payload);
        case 'selection/toggle':
          return {
            ok: true,
            handled: true,
            enabled: message.payload.enabled,
          };
        case 'floating-ui/open':
        case 'floating-ui/close':
          return {
            ok: true,
            handled: true,
            note: 'Floating UI messages are handled directly inside the content script.',
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
