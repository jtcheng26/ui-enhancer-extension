import type { StorageShape } from './keys';

export async function getStoredItem<Key extends keyof StorageShape>(
  key: Key,
  fallbackValue: StorageShape[Key],
): Promise<StorageShape[Key]> {
  const result = await browser.storage.local.get(key);
  return (result[key] as StorageShape[Key] | undefined) ?? fallbackValue;
}

export async function setStoredItem<Key extends keyof StorageShape>(
  key: Key,
  value: StorageShape[Key],
): Promise<void> {
  await browser.storage.local.set({
    [key]: value,
  });
}

export async function updateStoredItem<Key extends keyof StorageShape>(
  key: Key,
  fallbackValue: StorageShape[Key],
  updater: (currentValue: StorageShape[Key]) => StorageShape[Key],
): Promise<StorageShape[Key]> {
  const currentValue = await getStoredItem(key, fallbackValue);
  const nextValue = updater(currentValue);
  await setStoredItem(key, nextValue);
  return nextValue;
}

export async function removeStoredItem<Key extends keyof StorageShape>(
  key: Key,
): Promise<void> {
  await browser.storage.local.remove(key);
}
