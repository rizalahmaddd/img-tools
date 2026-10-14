import * as Comlink from 'comlink';
import { env, pipeline, RawImage, type ImageSegmentationPipeline } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web/webgpu';
import { MODEL_CACHE, SEG_MODELS, UPSCALE_MODELS, type Device } from './models';

env.allowLocalModels = false;
env.useBrowserCache = true;
if (!ort.env.wasm.wasmPaths) ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

export type ProgressFn = (p: { stage: 'download' | 'run'; progress: number; detail?: string }) => void;

const segmenters = new Map<string, Promise<ImageSegmentationPipeline>>();

function segmenter(modelId: string, device: Device, onProgress?: ProgressFn) {
  const key = `${modelId}:${device}`;
  if (!segmenters.has(key)) {
    const m = SEG_MODELS.find((x) => x.id === modelId)!;
    const files = new Map<string, { loaded: number; total: number }>();
    const p = pipeline('image-segmentation', m.repo[device], {
      device,
      dtype: m.dtype[device] as never,
      ...(m.file?.[device] ? { model_file_name: m.file[device] } : {}),
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === 'progress' && e.file) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
          let l = 0;
          let t = 0;
          files.forEach((f) => {
            l += f.loaded;
            t += f.total;
          });
          if (t > 0) onProgress?.({ stage: 'download', progress: l / t, detail: `${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB` });
        }
      },
    }) as unknown as Promise<ImageSegmentationPipeline>;
    p.catch(() => segmenters.delete(key));
    segmenters.set(key, p);
  }
  return segmenters.get(key)!;
}

async function removeBackground(blob: Blob, modelId: string, device: Device, onProgress?: ProgressFn): Promise<{ mask: Blob; device: Device }> {
  let used = device;
  let seg: ImageSegmentationPipeline;
  try {
    seg = await segmenter(modelId, device, onProgress);
  } catch (e) {
    if (device !== 'webgpu') throw e;
    used = 'wasm';
    seg = await segmenter(modelId, 'wasm', onProgress);
  }
  onProgress?.({ stage: 'run', progress: 0.5, detail: 'Memisahkan objek' });
  const image = await RawImage.fromBlob(blob);
  let out: { mask: RawImage }[];
  try {
    out = (await seg(image)) as unknown as { mask: RawImage }[];
  } catch (e) {
    if (used !== 'webgpu') throw e;
    used = 'wasm';
    seg = await segmenter(modelId, 'wasm', onProgress);
    out = (await seg(image)) as unknown as { mask: RawImage }[];
  }
  let mask = out[0].mask;
  if (mask.width !== image.width || mask.height !== image.height) mask = await mask.resize(image.width, image.height);
  const n = mask.width * mask.height;
  const rgba = new Uint8ClampedArray(n * 4);
  const ch = mask.channels;
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = mask.data[i * ch];
  }
  const c = new OffscreenCanvas(mask.width, mask.height);
  c.getContext('2d')!.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
  return { mask: await c.convertToBlob({ type: 'image/png' }), device: used };
}

async function fetchModel(url: string, onProgress?: ProgressFn): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Gagal mengunduh model (${res.status}). Periksa koneksi internet.`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) onProgress?.({ stage: 'download', progress: loaded / total, detail: `${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB` });
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  try {
    await cache?.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* quota or private mode, model just won't be cached */
  }
  return buf;
}

const sessions = new Map<string, Promise<ort.InferenceSession>>();

function session(modelId: string, device: Device, onProgress?: ProgressFn) {
  const key = `${modelId}:${device}`;
  if (!sessions.has(key)) {
    const m = UPSCALE_MODELS.find((x) => x.id === modelId)!;
    const url = m.url.startsWith('/') ? new URL(m.url, self.location.origin).href : m.url;
    const p = fetchModel(url, onProgress).then((buf) =>
      ort.InferenceSession.create(buf, {
        executionProviders: device === 'webgpu' ? ['webgpu'] : ['wasm'],
        graphOptimizationLevel: 'all',
      }),
    );
    p.catch(() => sessions.delete(key));
    sessions.set(key, p);
  }
  return sessions.get(key)!;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    return sign | ((mant + 0x1000) >> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  mant += 0x1000;
  if (mant & 0x800000) {
    mant = 0;
    exp++;
  }
  return sign | (exp << 10) | (mant >> 13);
}

function fromHalf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (mant / 1024);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

async function upscale(
  blob: Blob,
  modelId: string,
  device: Device,
  maxArea: number,
  onProgress?: ProgressFn,
): Promise<{ blob: Blob; width: number; height: number; device: Device }> {
  const m = UPSCALE_MODELS.find((x) => x.id === modelId)!;
  let used = device;
  let sess: ort.InferenceSession;
  try {
    sess = await session(modelId, device, onProgress);
  } catch (e) {
    if (device !== 'webgpu') throw e;
    used = 'wasm';
    sess = await session(modelId, 'wasm', onProgress);
  }
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
  const w = bmp.width;
  const h = bmp.height;
  const S = m.scale;
  if (w * S * h * S > maxArea) throw new Error(`Hasil ${w * S}×${h * S} melebihi batas memori perangkat. Perkecil gambar dulu atau pilih skala lebih kecil.`);
  const src = new OffscreenCanvas(w, h);
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0);
  bmp.close();
  const px = sctx.getImageData(0, 0, w, h).data;
  const W = w * S;
  const H = h * S;
  const out = new Uint8ClampedArray(W * H * 4);
  const pad = 12;
  const tile = Math.min(m.tile[used], Math.max(w, h));
  const win = tile + pad * 2;
  const cols = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  const total = cols * rows;
  const plane = win * win;
  const input = new Float32Array(plane * 3);
  const half = m.type === 'float16' ? new Uint16Array(plane * 3) : null;
  const inName = sess.inputNames[0];
  const outName = sess.outputNames[0];
  let n = 0;
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      const ox = tx - pad;
      const oy = ty - pad;
      // Edge pixels are replicated so every window has the same shape; WebGPU recompiles on each new shape.
      for (let y = 0; y < win; y++) {
        const sy = Math.min(h - 1, Math.max(0, oy + y));
        for (let x = 0; x < win; x++) {
          const sx = Math.min(w - 1, Math.max(0, ox + x));
          const si = (sy * w + sx) * 4;
          const di = y * win + x;
          input[di] = px[si] / 255;
          input[plane + di] = px[si + 1] / 255;
          input[plane * 2 + di] = px[si + 2] / 255;
        }
      }
      let tensor: ort.Tensor;
      if (half) {
        for (let i = 0; i < input.length; i++) half[i] = toHalf(input[i]);
        tensor = new ort.Tensor('float16', half, [1, 3, win, win]);
      } else tensor = new ort.Tensor('float32', input, [1, 3, win, win]);
      let result: ort.InferenceSession.OnnxValueMapType;
      try {
        result = await sess.run({ [inName]: tensor });
      } catch (e) {
        if (used === 'webgpu') {
          used = 'wasm';
          sess = await session(modelId, 'wasm', onProgress);
          result = await sess.run({ [inName]: tensor });
        } else throw e;
      }
      const t = result[outName];
      const data = t.data as Float32Array | Uint16Array;
      const isHalf = t.type === 'float16' && !(data instanceof Float32Array);
      const ow = win * S;
      const oplane = ow * ow;
      const validW = Math.min(tile, w - tx) * S;
      const validH = Math.min(tile, h - ty) * S;
      const offX = pad * S;
      const offY = pad * S;
      for (let y = 0; y < validH; y++) {
        const orow = (ty * S + y) * W;
        const irow = (offY + y) * ow + offX;
        for (let x = 0; x < validW; x++) {
          const ii = irow + x;
          const oi = (orow + tx * S + x) * 4;
          if (isHalf) {
            out[oi] = fromHalf(data[ii]) * 255;
            out[oi + 1] = fromHalf(data[oplane + ii]) * 255;
            out[oi + 2] = fromHalf(data[oplane * 2 + ii]) * 255;
          } else {
            out[oi] = data[ii] * 255;
            out[oi + 1] = data[oplane + ii] * 255;
            out[oi + 2] = data[oplane * 2 + ii] * 255;
          }
          out[oi + 3] = 255;
        }
      }
      t.dispose?.();
      n++;
      onProgress?.({ stage: 'run', progress: n / total, detail: `Bagian ${n} dari ${total}` });
    }
  }
  let hasAlpha = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { hasAlpha = true; break; }
  const dst = new OffscreenCanvas(W, H);
  const dctx = dst.getContext('2d', { willReadFrequently: hasAlpha })!;
  if (hasAlpha) {
    const a = new OffscreenCanvas(W, H);
    const actx = a.getContext('2d', { willReadFrequently: true })!;
    actx.imageSmoothingQuality = 'high';
    actx.drawImage(src, 0, 0, W, H);
    const ad = actx.getImageData(0, 0, W, H).data;
    for (let i = 3; i < out.length; i += 4) out[i] = ad[i];
  }
  dctx.putImageData(new ImageData(out, W, H), 0, 0);
  const result = await dst.convertToBlob(hasAlpha ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.95 });
  return { blob: result, width: W, height: H, device: used };
}

async function isCached(kind: 'seg' | 'upscale', modelId: string): Promise<boolean> {
  try {
    if (kind === 'upscale') {
      const m = UPSCALE_MODELS.find((x) => x.id === modelId)!;
      const url = m.url.startsWith('/') ? new URL(m.url, self.location.origin).href : m.url;
      return !!(await (await caches.open(MODEL_CACHE)).match(url));
    }
    const m = SEG_MODELS.find((x) => x.id === modelId)!;
    const c = await caches.open('transformers-cache');
    const keys = await c.keys();
    return (['webgpu', 'wasm'] as Device[]).some((d) => {
      const file = `${m.file?.[d] ?? (m.dtype[d] === 'fp32' ? 'model' : `model_${m.dtype[d]}`)}.onnx`;
      return keys.some((k) => k.url.includes(m.repo[d]) && k.url.endsWith(`/${file}`));
    });
  } catch {
    return false;
  }
}

const api = {
  removeBackground: (blob: Blob, modelId: string, device: Device, onProgress?: ProgressFn) => removeBackground(blob, modelId, device, onProgress),
  upscale: (blob: Blob, modelId: string, device: Device, maxArea: number, onProgress?: ProgressFn) => upscale(blob, modelId, device, maxArea, onProgress),
  isCached,
};

export type AiApi = typeof api;
Comlink.expose(api);
