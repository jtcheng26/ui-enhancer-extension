import type { AugmentationRequest } from '../types';
import { STORAGE_KEYS } from './keys';
import { getStoredItem, setStoredItem, updateStoredItem } from './local-storage';

const EMPTY_REQUESTS: AugmentationRequest[] = [];

export const requestStore = {
  async list() {
    return getStoredItem(STORAGE_KEYS.requestHistory, EMPTY_REQUESTS);
  },

  async add(request: AugmentationRequest) {
    return updateStoredItem(STORAGE_KEYS.requestHistory, EMPTY_REQUESTS, (items) => [
      request,
      ...items,
    ]);
  },

  async trim(limit = 10) {
    const items = await this.list();
    await setStoredItem(STORAGE_KEYS.requestHistory, items.slice(0, limit));
  },
};
