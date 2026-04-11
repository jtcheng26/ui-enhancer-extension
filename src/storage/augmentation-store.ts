import type { StoredAugmentationConfig } from '../types';
import { STORAGE_KEYS } from './keys';
import { getStoredItem, setStoredItem, updateStoredItem } from './local-storage';

const EMPTY_AUGMENTATIONS: StoredAugmentationConfig[] = [];

export const augmentationStore = {
  async list() {
    return getStoredItem(STORAGE_KEYS.augmentationConfigs, EMPTY_AUGMENTATIONS);
  },

  async upsert(config: StoredAugmentationConfig) {
    return updateStoredItem(
      STORAGE_KEYS.augmentationConfigs,
      EMPTY_AUGMENTATIONS,
      (configs) => {
        const existingIndex = configs.findIndex((item) => item.id === config.id);
        if (existingIndex === -1) {
          return [...configs, config];
        }

        return configs.map((item) => (item.id === config.id ? config : item));
      },
    );
  },

  async remove(id: string) {
    return updateStoredItem(
      STORAGE_KEYS.augmentationConfigs,
      EMPTY_AUGMENTATIONS,
      (configs) => configs.filter((item) => item.id !== id),
    );
  },

  async clear() {
    await setStoredItem(STORAGE_KEYS.augmentationConfigs, EMPTY_AUGMENTATIONS);
  },
};
