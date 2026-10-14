import { AbortedError, pool } from '@/engine/client';
import { current, useWorkspace, type Item, type Version } from '@/store/workspace';
import { errorMessage, toast, useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { haptic } from './device';

export interface WorkResult {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  hasAlpha?: boolean;
  note?: string;
}

export interface Skip {
  skip: string;
}

export const skip = (reason: string): Skip => ({ skip: reason });

export interface BatchOptions {
  label: string;
  toolLabel: string;
  items: Item[];
  concurrency?: number;
  work: (item: Item, version: Version, signal: AbortSignal, index: number, report: (p: number, detail?: string) => void) => Promise<WorkResult | Skip | null>;
  onDone?: (results: { item: Item; version: Version }[]) => void;
  quiet?: boolean;
}

export async function runBatch(o: BatchOptions): Promise<{ item: Item; version: Version }[]> {
  const ui = useUi.getState();
  const ctrl = new AbortController();
  const total = o.items.length;
  const pref = useSettings.getState().prefs.concurrency;
  pool.setSize(pref > 0 ? pref : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)));
  const concurrency = Math.max(1, Math.min(o.concurrency ?? pool.size, total));
  const taskId = ui.startTask({ label: o.label, total, cancel: () => ctrl.abort() });
  const results: { item: Item; version: Version }[] = [];
  const errors: string[] = [];
  const notes = new Set<string>();
  const skipped = new Map<string, number>();
  let done = 0;
  const queue = o.items.map((item, index) => ({ item, index }));

  const runOne = async () => {
    while (queue.length && !ctrl.signal.aborted) {
      const { item, index } = queue.shift()!;
      const latest = useWorkspace.getState().items.find((i) => i.id === item.id);
      if (!latest) {
        done++;
        continue;
      }
      try {
        const r = await o.work(latest, current(latest), ctrl.signal, index, (p, detail) =>
          useUi.getState().updateTask(taskId, { progress: p, detail: total > 1 ? `${latest.name}${detail ? ` · ${detail}` : ''}` : detail }),
        );
        if (r && 'skip' in r) skipped.set(r.skip, (skipped.get(r.skip) ?? 0) + 1);
        else if (r && !ctrl.signal.aborted) {
          const still = useWorkspace.getState().items.some((i) => i.id === latest.id);
          if (still) {
            const v = useWorkspace.getState().pushVersion(latest.id, { ...r, label: o.toolLabel });
            results.push({ item: latest, version: v });
          }
          if (r.note) notes.add(r.note);
        }
      } catch (e) {
        if (!(e instanceof AbortedError) && (e as Error)?.name !== 'AbortError') errors.push(`${latest.name}: ${errorMessage(e)}`);
      }
      done++;
      useUi.getState().updateTask(taskId, { done, progress: undefined });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, runOne));
  ui.endTask(taskId);

  if (ctrl.signal.aborted) {
    toast({ kind: 'warn', title: 'Proses dibatalkan', body: results.length ? `${results.length} gambar sempat diproses.` : undefined });
  } else if (errors.length) {
    haptic('error');
    toast({ kind: 'error', title: `${errors.length} dari ${total} gagal`, body: errors.slice(0, 2).join('\n'), duration: 8000 });
  }
  const skipCount = [...skipped.values()].reduce((a, b) => a + b, 0);
  if (skipCount && !ctrl.signal.aborted) {
    toast({
      kind: results.length ? 'info' : 'warn',
      title: results.length ? `${skipCount} gambar dilewati` : skipCount === 1 ? 'Gambar tidak diubah' : `${skipCount} gambar tidak diubah`,
      body: [...skipped.keys()].join(' '),
      duration: 7000,
    });
  }
  if (results.length && !o.quiet) {
    haptic('success');
    const ids = results.map((r) => r.item.id);
    toast({
      kind: 'success',
      title: results.length === 1 ? `${o.toolLabel} selesai` : `${o.toolLabel}: ${results.length} gambar selesai`,
      body: notes.size ? [...notes].slice(0, 2).join(' ') : undefined,
      duration: notes.size ? 8000 : 5000,
      actions: [{ label: 'Urungkan', run: () => ids.forEach((id) => useWorkspace.getState().undo(id)) }],
    });
  }
  o.onDone?.(results);
  return results;
}
