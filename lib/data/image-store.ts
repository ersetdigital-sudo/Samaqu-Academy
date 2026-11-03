const DB_NAME = 'smq_db';
const STORE_NAME = 'images';
const objectUrls = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putValue(id: string, value: Blob | null): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        if (value) store.put(value, id);
        else store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

function getAllValues(): Promise<{ id: string; value: unknown }[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        const result: { id: string; value: unknown }[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            result.push({ id: String(cursor.key), value: cursor.value });
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function loadImageUrls(): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  try {
    const values = await getAllValues();
    for (const { id, value } of values) {
      const previous = objectUrls.get(id);
      if (previous) {
        URL.revokeObjectURL(previous);
        objectUrls.delete(id);
      }
      if (value instanceof Blob) {
        const url = URL.createObjectURL(value);
        objectUrls.set(id, url);
        urls[id] = url;
      } else if (typeof value === 'string') {
        urls[id] = value;
      }
    }
  } catch {
    return {};
  }
  return urls;
}

export async function saveImageBlob(productId: string, blob: Blob): Promise<string> {
  await putValue(productId, blob);
  const previous = objectUrls.get(productId);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(blob);
  objectUrls.set(productId, url);
  return url;
}

export async function removeImageBlob(productId: string): Promise<void> {
  await putValue(productId, null);
  const previous = objectUrls.get(productId);
  if (previous) {
    URL.revokeObjectURL(previous);
    objectUrls.delete(productId);
  }
}
