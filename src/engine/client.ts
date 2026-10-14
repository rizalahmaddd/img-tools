import * as Comlink from 'comlink';
import type { EngineApi } from './engine.worker';
import type { Job, JobResult } from './types';
import { canvasLimits } from '@/lib/device';

interface Slot {
  worker: Worker;
  api: Comlink.Remote<EngineApi>;
  busy: boolean;
}

type Task = {
  fn: (api: Comlink.Remote<EngineApi>) => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
};

export class AbortedError extends Error {
  constructor() {
    super('Dibatalkan');
    this.name = 'AbortError';
  }
}

class Pool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

  private spawn(): Slot {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    const slot: Slot = { worker, api: Comlink.wrap<EngineApi>(worker), busy: false };
    this.slots.push(slot);
    return slot;
  }

  private kill(slot: Slot) {
    slot.worker.terminate();
    this.slots = this.slots.filter((s) => s !== slot);
  }

  setSize(n: number) {
    this.size = Math.max(1, Math.min(8, n));
  }

  run<T>(fn: (api: Comlink.Remote<EngineApi>) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new AbortedError());
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve: resolve as (v: unknown) => void, reject, signal });
      this.pump();
    });
  }

  private pump() {
    while (this.queue.length) {
      let slot = this.slots.find((s) => !s.busy);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const task = this.queue.shift()!;
      if (task.signal?.aborted) {
        task.reject(new AbortedError());
        continue;
      }
      const s = slot;
      s.busy = true;
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        this.kill(s);
        task.reject(new AbortedError());
        this.pump();
      };
      task.signal?.addEventListener('abort', onAbort, { once: true });
      task
        .fn(s.api)
        .then(
          (v) => {
            if (settled) return;
            settled = true;
            task.resolve(v);
          },
          (e) => {
            if (settled) return;
            settled = true;
            task.reject(e);
          },
        )
        .finally(() => {
          task.signal?.removeEventListener('abort', onAbort);
          s.busy = false;
          this.pump();
        });
    }
  }
}

export const pool = new Pool();

export function process(blob: Blob, job: Omit<Job, 'maxArea' | 'maxDim'>, signal?: AbortSignal): Promise<JobResult> {
  const { maxArea, maxDim } = canvasLimits();
  return pool.run((api) => api.runJob(blob, { ...job, maxArea, maxDim }), signal);
}

export const engine = {
  probe: (blob: Blob) => pool.run((api) => api.probe(blob)),
  thumbnail: (blob: Blob, size = 320) => pool.run((api) => api.thumbnail(blob, size)),
  toPng: (blob: Blob) => {
    const { maxArea, maxDim } = canvasLimits();
    return pool.run((api) => api.toPng(blob, maxArea, maxDim));
  },
  pixels: (blob: Blob, max: number) => pool.run((api) => api.pixels(blob, max)),
  palette: (blob: Blob, count: number) => pool.run((api) => api.palette(blob, count)),
  makeGif: (...args: Parameters<EngineApi['makeGif']>) => pool.run((api) => api.makeGif(...args)),
};
