import type {
  AugmentationRequest,
  ExtensionSettings,
  ParsedSchema,
  StoredAugmentationConfig,
} from "../types";

export const STORAGE_KEYS = {
  augmentationConfigs: "augmentationConfigs",
  settings: "settings",
  parsedSchemas: "parsedSchemas",
  requestHistory: "requestHistory",
} as const;

export interface StorageShape {
  [STORAGE_KEYS.augmentationConfigs]: StoredAugmentationConfig[];
  [STORAGE_KEYS.settings]: ExtensionSettings;
  [STORAGE_KEYS.parsedSchemas]: ParsedSchema[];
  [STORAGE_KEYS.requestHistory]: AugmentationRequest[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectionModeEnabled: false,
  injectDemoCardOnLoad: false,
  customSchemaUrl: "",
};
