import { createSurface, ctxOf, fitArea, readPixels, surfaceHasAlpha } from './canvas';
import { decode } from './decode';
import { encodeSurface } from './encode';
import { applyOp, resizeTo } from './ops';
import type { Job, JobResult, ProbeResult } from './types';

export async function runJob(blob: Blob, job: Job): Promise<JobResult> {
  const dec = await decode(blob, job.maxArea, job.maxDim);
  let s = dec.surface;
  let scale = dec.downscaled ? s.width / dec.originalWidth : 1;
  if (job.previewMax && Math.max(s.width, s.height) > job.previewMax) {
    const k = job.previewMax / Math.max(s.width, s.height);
    s = await resizeTo(s, s.width * k, s.height * k, 'box');
    scale *= k;
  }
  for (const op of job.ops) s = await applyOp(s, op, scale, job.vars);
  const notes: string[] = [];
  if (dec.downscaled) notes.push(`Gambar asli ${dec.originalWidth}×${dec.originalHeight} diperkecil agar muat di memori browser.`);
  const fit = fitArea(s.width, s.height, job.maxArea, job.maxDim);
  if (fit.scaled) {
    s = await resizeTo(s, fit.w, fit.h);
    notes.push(`Hasil dibatasi ke ${fit.w}×${fit.h} karena batas kanvas perangkat ini.`);
  }
  const enc = await encodeSurface(s, job.output, dec.mime);
  if (enc.note) notes.push(enc.note);
  return {
    blob: enc.blob,
    width: enc.surface.width,
    height: enc.surface.height,
    mime: enc.blob.type,
    downscaled: dec.downscaled,
    note: notes.join(' ') || undefined,
  };
}

export async function probe(blob: Blob): Promise<ProbeResult> {
  const dec = await decode(blob);
  return { width: dec.surface.width, height: dec.surface.height, mime: dec.mime, hasAlpha: surfaceHasAlpha(dec.surface) };
}

export async function thumbnail(blob: Blob, size: number): Promise<{ blob: Blob; width: number; height: number; mime: string; hasAlpha: boolean }> {
  const dec = await decode(blob);
  const s = dec.surface;
  const k = Math.min(1, size / Math.max(s.width, s.height));
  const t = createSurface(s.width * k, s.height * k);
  const c = ctxOf(t);
  c.imageSmoothingQuality = 'high';
  c.drawImage(s, 0, 0, t.width, t.height);
  const alpha = surfaceHasAlpha(t);
  let out = await t.convertToBlob({ type: 'image/webp', quality: 0.8 });
  if (out.type !== 'image/webp') out = await t.convertToBlob({ type: alpha ? 'image/png' : 'image/jpeg', quality: 0.8 });
  return { blob: out, width: s.width, height: s.height, mime: dec.mime, hasAlpha: alpha };
}

export async function toPng(blob: Blob, maxArea: number, maxDim: number): Promise<{ blob: Blob; width: number; height: number; downscaled: boolean }> {
  const dec = await decode(blob, maxArea, maxDim);
  const alpha = surfaceHasAlpha(dec.surface);
  const out = alpha
    ? await dec.surface.convertToBlob({ type: 'image/png' })
    : await dec.surface.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return { blob: out, width: dec.surface.width, height: dec.surface.height, downscaled: dec.downscaled };
}

export async function pixels(blob: Blob, max: number): Promise<ImageData> {
  const dec = await decode(blob);
  const s = dec.surface;
  const k = Math.min(1, max / Math.max(s.width, s.height));
  const t = createSurface(s.width * k, s.height * k);
  const c = ctxOf(t, true);
  c.imageSmoothingQuality = 'high';
  c.drawImage(s, 0, 0, t.width, t.height);
  return readPixels(t);
}

export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  share: number;
}

export async function palette(blob: Blob, count: number): Promise<PaletteColor[]> {
  const data = await pixels(blob, 200);
  const iq = await import('image-q');
  const pc = iq.utils.PointContainer.fromUint8Array(data.data, data.width, data.height);
  const pal = await iq.buildPalette([pc], { colors: count, paletteQuantization: 'wuquant', colorDistanceFormula: 'euclidean-bt709' });
  const points = pal.getPointContainer().getPointArray();
  const counts = new Array(points.length).fill(0);
  const d = data.data;
  let total = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 128) continue;
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < points.length; j++) {
      const p = points[j];
      const dist = (p.r - d[i]) ** 2 + (p.g - d[i + 1]) ** 2 + (p.b - d[i + 2]) ** 2;
      if (dist < bd) {
        bd = dist;
        best = j;
      }
    }
    counts[best]++;
    total++;
  }
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return points
    .map((p, i) => ({ hex: `#${hex(p.r)}${hex(p.g)}${hex(p.b)}`, rgb: [p.r, p.g, p.b] as [number, number, number], share: total ? counts[i] / total : 0 }))
    .filter((c) => c.share > 0.002)
    .sort((a, b) => b.share - a.share);
}

export interface GifOptions {
  width: number;
  height: number;
  delay: number;
  loop: boolean;
  fit: 'contain' | 'cover';
  background: string;
  colors: number;
}

export async function makeGif(blobs: Blob[], o: GifOptions, delays?: number[]): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  const frame = createSurface(o.width, o.height);
  const c = ctxOf(frame, true);
  for (let i = 0; i < blobs.length; i++) {
    const dec = await decode(blobs[i]);
    const s = dec.surface;
    c.fillStyle = o.background;
    c.fillRect(0, 0, o.width, o.height);
    const k = o.fit === 'cover' ? Math.max(o.width / s.width, o.height / s.height) : Math.min(o.width / s.width, o.height / s.height);
    c.imageSmoothingQuality = 'high';
    c.drawImage(s, (o.width - s.width * k) / 2, (o.height - s.height * k) / 2, s.width * k, s.height * k);
    const { data } = c.getImageData(0, 0, o.width, o.height);
    const pal = quantize(data, o.colors);
    const index = applyPalette(data, pal);
    gif.writeFrame(index, o.width, o.height, { palette: pal, delay: delays?.[i] ?? o.delay, repeat: o.loop ? 0 : -1 });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
