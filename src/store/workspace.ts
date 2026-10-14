import { create } from 'zustand';
import { engine } from '@/engine/client';
import { uid } from '@/lib/format';
import { idb, requestPersistence } from './persist';
import { useSettings } from './settings';
import { toast } from './ui';

export interface Version {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  size: number;
  label: string;
  hasAlpha: boolean;
  thumb?: Blob;
  createdAt: number;
}

export interface Item {
  id: string;
  name: string;
  source: Blob;
  sourceMime: string;
  versions: Version[];
  cursor: number;
  addedAt: number;
  animated?: boolean;
}

type VersionInput = Omit<Version, 'id' | 'size' | 'createdAt' | 'hasAlpha' | 'thumb'> & { hasAlpha?: boolean };

interface WorkspaceState {
  items: Item[];
  activeId: string | null;
  selected: string[];
  hydrated: boolean;
  add: (items: Item[]) => void;
  remove: (ids: string[]) => void;
  clear: () => void;
  setActive: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  setSelected: (ids: string[]) => void;
  selectAll: () => void;
  rename: (id: string, name: string) => void;
  reorder: (ids: string[]) => void;
  pushVersion: (id: string, v: VersionInput) => Version;
  undo: (id: string) => void;
  redo: (id: string) => void;
  revert: (id: string) => void;
  goto: (id: string, cursor: number) => void;
  setThumb: (itemId: string, versionId: string, thumb: Blob, hasAlpha: boolean) => void;
}

export const current = (item: Item): Version => item.versions[item.cursor] ?? item.versions[item.versions.length - 1];

const blobKey = (id: string) => `b:${id}`;
const sourceKey = (id: string) => `s:${id}`;
const thumbKey = (id: string) => `t:${id}`;

interface ManifestItem {
  id: string;
  name: string;
  sourceMime: string;
  cursor: number;
  addedAt: number;
  animated?: boolean;
  versions: Omit<Version, 'blob' | 'thumb'>[];
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let quotaWarned = false;

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { items, activeId, selected } = useWorkspace.getState();
  const manifest: ManifestItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    sourceMime: i.sourceMime,
    cursor: i.cursor,
    addedAt: i.addedAt,
    animated: i.animated,
    versions: i.versions.map(({ blob: _b, thumb: _t, ...rest }) => rest),
  }));
  try {
    await idb.set('manifest', { items: manifest, activeId, selected });
  } catch (e) {
    handleQuota(e);
  }
}

function scheduleSave() {
  // Throttle, not debounce: a steady stream of thumbnail updates would otherwise postpone the save forever.
  if (saveTimer !== undefined) return;
  saveTimer = setTimeout(saveNow, 250);
}

if (typeof window !== 'undefined') {
  const flush = () => saveTimer !== undefined && saveNow();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

function handleQuota(e: unknown) {
  if (quotaWarned) return;
  quotaWarned = true;
  toast({
    kind: 'warn',
    title: 'Berkas tidak tersimpan otomatis',
    body: (e as Error)?.name === 'QuotaExceededError' ? 'Penyimpanan browser penuh. Hapus gambar yang tidak dipakai.' : 'Mode privat atau penyimpanan diblokir. Berkas hilang saat halaman ditutup.',
  });
}

function persistBlobs(entries: [string, Blob][]) {
  if (!entries.length) return;
  idb.setMany(entries).catch(handleQuota);
}

function dropBlobs(versions: Version[]) {
  idb.delMany(versions.flatMap((v) => [blobKey(v.id), thumbKey(v.id)]));
}

function makeThumb(itemId: string, v: Version) {
  engine
    .thumbnail(v.blob, 320)
    .then((t) => useWorkspace.getState().setThumb(itemId, v.id, t.blob, t.hasAlpha))
    .catch(() => undefined);
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  items: [],
  activeId: null,
  selected: [],
  hydrated: false,

  add: (items) => {
    if (!items.length) return;
    set((s) => ({
      items: [...s.items, ...items],
      activeId: items[0].id,
      selected: [...new Set([...s.selected, ...items.map((i) => i.id)])],
    }));
    persistBlobs(items.flatMap((i) => [[sourceKey(i.id), i.source] as [string, Blob], ...i.versions.map((v) => [blobKey(v.id), v.blob] as [string, Blob])]));
    items.forEach((i) => i.versions.forEach((v) => !v.thumb && makeThumb(i.id, v)));
    requestPersistence();
    saveNow();
  },

  remove: (ids) => {
    const set_ = new Set(ids);
    const gone = get().items.filter((i) => set_.has(i.id));
    gone.forEach((i) => dropBlobs(i.versions));
    idb.delMany(gone.map((i) => sourceKey(i.id)));
    set((s) => {
      const items = s.items.filter((i) => !set_.has(i.id));
      return {
        items,
        selected: s.selected.filter((id) => !set_.has(id)),
        activeId: s.activeId && set_.has(s.activeId) ? (items[0]?.id ?? null) : s.activeId,
      };
    });
    saveNow();
  },

  clear: () => get().remove(get().items.map((i) => i.id)),

  setActive: (id) => {
    set({ activeId: id });
    scheduleSave();
  },

  toggleSelect: (id) => {
    set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));
    scheduleSave();
  },

  setSelected: (ids) => {
    set({ selected: ids });
    scheduleSave();
  },

  selectAll: () => {
    const all = get().items.map((i) => i.id);
    set((s) => ({ selected: s.selected.length === all.length ? [] : all }));
    scheduleSave();
  },

  rename: (id, name) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, name: name.trim() || i.name } : i)) }));
    scheduleSave();
  },

  reorder: (ids) => {
    const map = new Map(get().items.map((i) => [i.id, i]));
    set({ items: ids.map((id) => map.get(id)!).filter(Boolean) });
    scheduleSave();
  },

  pushVersion: (id, input) => {
    const version: Version = {
      ...input,
      hasAlpha: input.hasAlpha ?? false,
      id: uid(),
      size: input.blob.size,
      createdAt: Date.now(),
    };
    const limit = Math.max(2, useSettings.getState().prefs.historyLimit);
    let dropped: Version[] = [];
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== id) return i;
        let versions = [...i.versions.slice(0, i.cursor + 1), version];
        dropped = i.versions.slice(i.cursor + 1);
        if (versions.length > limit) {
          dropped = [...dropped, ...versions.slice(1, versions.length - limit + 1)];
          versions = [versions[0], ...versions.slice(versions.length - limit + 1)];
        }
        return { ...i, versions, cursor: versions.length - 1 };
      }),
    }));
    dropBlobs(dropped);
    persistBlobs([[blobKey(version.id), version.blob]]);
    makeThumb(id, version);
    scheduleSave();
    return version;
  },

  undo: (id) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id && i.cursor > 0 ? { ...i, cursor: i.cursor - 1 } : i)) }));
    scheduleSave();
  },

  redo: (id) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id && i.cursor < i.versions.length - 1 ? { ...i, cursor: i.cursor + 1 } : i)) }));
    scheduleSave();
  },

  revert: (id) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, cursor: 0 } : i)) }));
    scheduleSave();
  },

  goto: (id, cursor) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, cursor: Math.max(0, Math.min(i.versions.length - 1, cursor)) } : i)) }));
    scheduleSave();
  },

  setThumb: (itemId, versionId, thumb, hasAlpha) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id !== itemId ? i : { ...i, versions: i.versions.map((v) => (v.id === versionId ? { ...v, thumb, hasAlpha } : v)) },
      ),
    }));
    persistBlobs([[thumbKey(versionId), thumb]]);
    scheduleSave();
  },
}));

export async function hydrateWorkspace() {
  try {
    const m = await idb.get<{ items: ManifestItem[]; activeId: string | null; selected: string[] }>('manifest');
    if (!m?.items?.length) return;
    const items: Item[] = [];
    for (const mi of m.items) {
      const source = await idb.get<Blob>(sourceKey(mi.id));
      const versions: Version[] = [];
      for (const v of mi.versions) {
        const blob = await idb.get<Blob>(blobKey(v.id));
        if (!blob) continue;
        const thumb = await idb.get<Blob>(thumbKey(v.id));
        versions.push({ ...v, blob, thumb });
      }
      if (!versions.length) continue;
      items.push({
        id: mi.id,
        name: mi.name,
        source: source ?? versions[0].blob,
        sourceMime: mi.sourceMime,
        cursor: Math.min(mi.cursor, versions.length - 1),
        addedAt: mi.addedAt,
        animated: mi.animated,
        versions,
      });
    }
    const ids = new Set(items.map((i) => i.id));
    useWorkspace.setState({
      items: [...items, ...useWorkspace.getState().items.filter((i) => !ids.has(i.id))],
      activeId: m.activeId && ids.has(m.activeId) ? m.activeId : (items[0]?.id ?? null),
      selected: (m.selected ?? []).filter((id) => ids.has(id)),
    });
    items.forEach((i) => i.versions.forEach((v) => !v.thumb && makeThumb(i.id, v)));
  } finally {
    useWorkspace.setState({ hydrated: true });
  }
}

export function useActiveItem(): Item | null {
  return useWorkspace((s) => s.items.find((i) => i.id === s.activeId) ?? s.items[0] ?? null);
}

export function getTargets(): Item[] {
  const { items, selected, activeId } = useWorkspace.getState();
  const sel = items.filter((i) => selected.includes(i.id));
  if (sel.length) return sel;
  const active = items.find((i) => i.id === activeId) ?? items[0];
  return active ? [active] : [];
}

export function useTargets(): Item[] {
  const items = useWorkspace((s) => s.items);
  const selected = useWorkspace((s) => s.selected);
  const activeId = useWorkspace((s) => s.activeId);
  const sel = items.filter((i) => selected.includes(i.id));
  if (sel.length) return sel;
  const active = items.find((i) => i.id === activeId) ?? items[0];
  return active ? [active] : [];
}
