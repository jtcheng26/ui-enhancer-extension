import type { AugmentationRequest } from '../types';
import { requestStore } from '../storage/request-store';
import { settingsStore } from '../storage/settings-store';
import { logger } from '../utils/logger';

export async function submitAugmentationRequest(
  prompt: string,
  source: AugmentationRequest['source'],
): Promise<AugmentationRequest> {
  const request: AugmentationRequest = {
    id: crypto.randomUUID(),
    prompt: prompt.trim(),
    createdAt: new Date().toISOString(),
    source,
    status: 'mock-submitted',
  };

  await requestStore.add(request);
  await requestStore.trim();
  await settingsStore.patch({
    lastCommand: request.prompt,
  });

  logger.info('Stored mock augmentation request for future AI handling.', request);

  // TODO: Route requests through background messaging and real LLM orchestration.
  return request;
}
