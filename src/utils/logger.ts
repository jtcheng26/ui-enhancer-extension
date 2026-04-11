const LOG_PREFIX = '[ai-ui-prototype]';

export const logger = {
  info(message: string, context?: unknown) {
    console.info(LOG_PREFIX, message, context ?? '');
  },
  warn(message: string, context?: unknown) {
    console.warn(LOG_PREFIX, message, context ?? '');
  },
  error(message: string, context?: unknown) {
    console.error(LOG_PREFIX, message, context ?? '');
  },
};
