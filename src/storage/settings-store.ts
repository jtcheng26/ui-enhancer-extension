import type { ExtensionSettings } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './keys';
import { getStoredItem, setStoredItem } from './local-storage';

export const settingsStore = {
  async get() {
    return getStoredItem(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  },

  async set(nextSettings: ExtensionSettings) {
    await setStoredItem(STORAGE_KEYS.settings, nextSettings);
  },

  async patch(partial: Partial<ExtensionSettings>) {
    const currentSettings = await this.get();
    const nextSettings = {
      ...currentSettings,
      ...partial,
    };
    await this.set(nextSettings);
    return nextSettings;
  },

  subscribe(listener: (settings: ExtensionSettings) => void) {
    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes[STORAGE_KEYS.settings]) {
        return;
      }

      const nextValue = changes[STORAGE_KEYS.settings].newValue as
        | ExtensionSettings
        | undefined;

      listener({
        ...DEFAULT_SETTINGS,
        ...nextValue,
      });
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  },
};
