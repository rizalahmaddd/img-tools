import * as Comlink from 'comlink';
import { hasWebGPU } from '@/lib/device';
import { useSettings } from '@/store/settings';
import type { AiApi, ProgressFn } from './ai.worker';
import { SEG_MODELS, type Device } from './models';

let worker: Worker | null = null;
let api: Comlink.Remote<AiApi> | null = null;

function get() {
  if (!api) {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    api = Comlink.wrap<AiApi>(worker);
  }
  return api;
}

export function resetAi() {
  worker?.terminate();
  worker = null;
  api = null;
}

let gpu: Promise<boolean> | null = null;

export async function pickDevice(): Promise<Device> {
  const pref = useSettings.getState().prefs.aiDevice;
  if (pref === 'wasm') return 'wasm';
  gpu ??= hasWebGPU();
  const ok = await gpu;
  return ok ? 'webgpu' : 'wasm';
}

export function webgpuAvailable() {
  gpu ??= hasWebGPU();
  return gpu;
}

function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      // A running inference can't be interrupted, so the whole worker goes and the model reloads next time.
      resetAi();
      reject(new DOMException('Dibatalkan', 'AbortError'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function gpuStorageBuffers(): Promise<number> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ limits: { maxStorageBuffersPerShaderStage: number } } | null> } }).gpu;
    return (await gpu?.requestAdapter())?.limits.maxStorageBuffersPerShaderStage ?? 0;
  } catch {
    return 0;
  }
}

export async function segDevice(modelId: string): Promise<Device> {
  if (SEG_MODELS.find((m) => m.id === modelId)?.cpuOnly) return 'wasm';
  const d = await pickDevice();
  // The patched BiRefNet graph needs at least 8 storage buffers per stage; weaker adapters fail at run time.
  if (d === 'webgpu' && modelId === 'birefnet' && (await gpuStorageBuffers()) < 8) return 'wasm';
  return d;
}

export async function removeBackground(blob: Blob, modelId: string, onProgress?: ProgressFn, signal?: AbortSignal) {
  const device = await segDevice(modelId);
  return withAbort(get().removeBackground(blob, modelId, device, onProgress ? Comlink.proxy(onProgress) : undefined), signal);
}

export async function upscale(blob: Blob, modelId: string, maxArea: number, onProgress?: ProgressFn, signal?: AbortSignal) {
  const device = await pickDevice();
  return withAbort(get().upscale(blob, modelId, device, maxArea, onProgress ? Comlink.proxy(onProgress) : undefined), signal);
}

export function isModelCached(kind: 'seg' | 'upscale', id: string) {
  return get().isCached(kind, id);
}

export async function clearModelCache() {
  resetAi();
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.includes('transformers') || n.includes('racik-models') || n.includes('onnx')).map((n) => caches.delete(n)));
}
