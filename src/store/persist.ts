import { createStore, del, delMany, get, keys, set, setMany } from 'idb-keyval';

const store = typeof indexedDB !== 'undefined' ? createStore('racik', 'workspace') : undefined;

export const idb = {
  get: <T>(k: string) => get<T>(k, store).catch(() => undefined),
  set: (k: string, v: unknown) => set(k, v, store),
  setMany: (entries: [string, unknown][]) => setMany(entries, store),
  del: (k: string) => del(k, store).catch(() => undefined),
  delMany: (ks: string[]) => delMany(ks, store).catch(() => undefined),
  keys: () => keys(store).catch(() => [] as IDBValidKey[]),
};

export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return { usage: e?.usage ?? 0, quota: e?.quota ?? 0 };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* not available */
  }
}
