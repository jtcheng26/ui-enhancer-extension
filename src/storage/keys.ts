import type {
  AugmentationRequest,
  ExtensionSettings,
  ParsedSchema,
  PersistedAugmentation,
  StoredAugmentationConfig,
} from "../types";

export const STORAGE_KEYS = {
  augmentationConfigs: "augmentationConfigs",
  persistedAugmentations: "persistedAugmentations",
  settings: "settings",
  parsedSchemas: "parsedSchemas",
  requestHistory: "requestHistory",
} as const;

export interface StorageShape {
  [STORAGE_KEYS.augmentationConfigs]: StoredAugmentationConfig[];
  [STORAGE_KEYS.persistedAugmentations]: PersistedAugmentation[];
  [STORAGE_KEYS.settings]: ExtensionSettings;
  [STORAGE_KEYS.parsedSchemas]: ParsedSchema[];
  [STORAGE_KEYS.requestHistory]: AugmentationRequest[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectionModeEnabled: false,
  injectDemoCardOnLoad: false,
  customSchemaUrl: "",
};
