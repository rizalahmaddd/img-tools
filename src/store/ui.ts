import { create } from 'zustand';
import { uid } from '@/lib/format';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error' | 'warn';
  title: string;
  body?: string;
  actions?: ToastAction[];
  duration: number;
}

export interface Task {
  id: string;
  label: string;
  done: number;
  total: number;
  detail?: string;
  progress?: number;
  cancel?: () => void;
}

interface UiState {
  toasts: Toast[];
  tasks: Task[];
  toast: (t: Omit<Toast, 'id' | 'duration' | 'kind'> & { kind?: Toast['kind']; duration?: number }) => string;
  dismiss: (id: string) => void;
  startTask: (t: Omit<Task, 'id' | 'done'> & { done?: number }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  endTask: (id: string) => void;
}

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  tasks: [],
  toast: (t) => {
    const id = uid();
    const toast: Toast = { kind: 'info', duration: t.actions?.length ? 7000 : 3500, ...t, id };
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    if (toast.duration > 0) setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  startTask: (t) => {
    const id = uid();
    set((s) => ({ tasks: [...s.tasks, { done: 0, ...t, id }] }));
    return id;
  },
  updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  endTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));

export const toast = (...a: Parameters<UiState['toast']>) => useUi.getState().toast(...a);

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'QuotaExceededError') return 'Penyimpanan browser penuh. Hapus beberapa gambar di Berkas.';
    if (/memory|allocation|out of memory/i.test(e.message)) return 'Memori perangkat tidak cukup. Coba gambar yang lebih kecil atau proses satu per satu.';
    return e.message;
  }
  return String(e);
}
