import type {
  PersistedAugmentation,
  PersistedAugmentationStore,
} from "../types";
import { STORAGE_KEYS } from "./keys";
import {
  getStoredItem,
  setStoredItem,
  updateStoredItem,
} from "./local-storage";

const EMPTY_PERSISTED_AUGMENTATIONS: PersistedAugmentation[] = [];

export const persistedAugmentationStore: PersistedAugmentationStore = {
  async list() {
    return getStoredItem(
      STORAGE_KEYS.persistedAugmentations,
      EMPTY_PERSISTED_AUGMENTATIONS,
    );
  },

  async upsert(augmentation) {
    await updateStoredItem(
      STORAGE_KEYS.persistedAugmentations,
      EMPTY_PERSISTED_AUGMENTATIONS,
      (augmentations) => {
        const existingIndex = augmentations.findIndex(
          (item) => item.id === augmentation.id,
        );

        if (existingIndex === -1) {
          return [...augmentations, augmentation];
        }

        return augmentations.map((item) =>
          item.id === augmentation.id ? augmentation : item,
        );
      },
    );

    return augmentation;
  },

  async setEnabled(id, enabled) {
    const augmentations = await updateStoredItem(
      STORAGE_KEYS.persistedAugmentations,
      EMPTY_PERSISTED_AUGMENTATIONS,
      (items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                enabled,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
    );

    return augmentations.find((item) => item.id === id) ?? null;
  },

  async remove(id) {
    await updateStoredItem(
      STORAGE_KEYS.persistedAugmentations,
      EMPTY_PERSISTED_AUGMENTATIONS,
      (augmentations) => augmentations.filter((item) => item.id !== id),
    );
  },

  async clear() {
    await setStoredItem(
      STORAGE_KEYS.persistedAugmentations,
      EMPTY_PERSISTED_AUGMENTATIONS,
    );
  },
};
