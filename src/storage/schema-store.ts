import type { ParsedSchema } from '../types';
import { STORAGE_KEYS } from './keys';
import { getStoredItem, setStoredItem, updateStoredItem } from './local-storage';

const EMPTY_SCHEMAS: ParsedSchema[] = [];

export const schemaStore = {
  async list() {
    return getStoredItem(STORAGE_KEYS.parsedSchemas, EMPTY_SCHEMAS);
  },

  async upsert(schema: ParsedSchema) {
    return updateStoredItem(STORAGE_KEYS.parsedSchemas, EMPTY_SCHEMAS, (schemas) => {
      const existingIndex = schemas.findIndex(
        (item) => item.sourceUrl === schema.sourceUrl,
      );

      if (existingIndex === -1) {
        return [...schemas, schema];
      }

      return schemas.map((item) =>
        item.sourceUrl === schema.sourceUrl ? schema : item,
      );
    });
  },

  async clear() {
    await setStoredItem(STORAGE_KEYS.parsedSchemas, EMPTY_SCHEMAS);
  },
};
