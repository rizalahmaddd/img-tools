import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  namePattern: string;
  zip: boolean;
  concurrency: number;
  aiDevice: 'auto' | 'webgpu' | 'wasm';
  historyLimit: number;
  keepExif: boolean;
  applyToSelection: boolean;
  confirmDelete: boolean;
}

export const defaultPrefs: Prefs = {
  theme: 'system',
  namePattern: '{name}',
  zip: true,
  concurrency: 0,
  aiDevice: 'auto',
  historyLimit: 12,
  keepExif: false,
  applyToSelection: true,
  confirmDelete: true,
};

interface SettingsState {
  prefs: Prefs;
  tools: Record<string, Record<string, unknown>>;
  setPrefs: (p: Partial<Prefs>) => void;
  setTool: (id: string, patch: Record<string, unknown>) => void;
  resetTool: (id: string) => void;
  resetAll: () => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      prefs: defaultPrefs,
      tools: {},
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setTool: (id, patch) => set((s) => ({ tools: { ...s.tools, [id]: { ...s.tools[id], ...patch } } })),
      resetTool: (id) =>
        set((s) => {
          const tools = { ...s.tools };
          delete tools[id];
          return { tools };
        }),
      resetAll: () => set({ prefs: defaultPrefs, tools: {} }),
    }),
    {
      name: 'racik-settings',
      version: 1,
      storage: safeStorage,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, prefs: { ...defaultPrefs, ...p.prefs }, tools: p.tools ?? {} };
      },
    },
  ),
);

export function useToolSettings<T extends object>(id: string, defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const stored = useSettings((s) => s.tools[id]);
  const setTool = useSettings((s) => s.setTool);
  const resetTool = useSettings((s) => s.resetTool);
  const value = useMemo(() => {
    const merged = { ...defaults } as Record<string, unknown>;
    if (stored) {
      for (const k of Object.keys(defaults)) {
        // Only keep stored values whose type still matches, so old saved settings can't break a newer tool.
        const def = (defaults as Record<string, unknown>)[k];
        const val = stored[k];
        const compatible = val === null || def === null || (typeof val === typeof def && Array.isArray(val) === Array.isArray(def));
        if (k in stored && compatible) merged[k] = val;
      }
    }
    return merged as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  const update = useCallback((patch: Partial<T>) => setTool(id, patch as Record<string, unknown>), [id, setTool]);
  const reset = useCallback(() => resetTool(id), [id, resetTool]);
  return [value, update, reset];
}

export function usePrefs() {
  return useSettings((s) => s.prefs);
}
