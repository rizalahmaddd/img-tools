import { create } from 'zustand';
import { useWorkspace, type Item } from './workspace';

export type Scope = 'active' | 'selected' | 'all';

export const useScope = create<{ scope: Scope; setScope: (s: Scope) => void }>((set) => ({
  scope: 'selected',
  setScope: (scope) => set({ scope }),
}));

export function resolveTargets(scope: Scope, items: Item[], selected: string[], activeId: string | null): Item[] {
  const active = items.find((i) => i.id === activeId) ?? items[0];
  if (scope === 'all') return items;
  if (scope === 'selected') {
    const sel = items.filter((i) => selected.includes(i.id));
    if (sel.length) return sel;
  }
  return active ? [active] : [];
}

export function effectiveScope(scope: Scope, selectedCount: number): Scope {
  return scope === 'selected' && selectedCount === 0 ? 'active' : scope;
}

export function useScopedTargets(): Item[] {
  const scope = useScope((s) => s.scope);
  const items = useWorkspace((s) => s.items);
  const selected = useWorkspace((s) => s.selected);
  const activeId = useWorkspace((s) => s.activeId);
  return resolveTargets(scope, items, selected, activeId);
}

export function getScopedTargets(): Item[] {
  const { items, selected, activeId } = useWorkspace.getState();
  return resolveTargets(useScope.getState().scope, items, selected, activeId);
}
