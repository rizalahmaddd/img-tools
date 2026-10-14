import { createSurface, ctxOf, flatten, readPixels, surfaceHasAlpha, type Surface } from './canvas';
import { formatById, formatFromMime } from './formats';
import type { Format, OutputSpec } from './types';

const clampQ = (q: number) => Math.max(1, Math.min(100, Math.round(q)));

async function nativeBlob(s: Surface, mime: string, quality?: number): Promise<Blob | null> {
  try {
    const b = await s.convertToBlob({ type: mime, quality });
    return b.type === mime ? b : null;
  } catch {
    return null;
  }
}

async function encodePng(s: Surface, spec: OutputSpec): Promise<Blob> {
  let data = readPixels(s);
  if (spec.pngColors > 0 && spec.pngColors < 256 * 256) {
    data = await quantize(data, Math.min(256, spec.pngColors), spec.pngDither);
  }
  let buf: ArrayBuffer;
  const native = spec.pngColors > 0 ? null : await nativeBlob(s, 'image/png');
  if (native) buf = await native.arrayBuffer();
  else buf = await (await import('@jsquash/png')).encode(data);
  if (spec.pngOptimize >= 0 || spec.pngColors > 0) {
    const { optimise } = await import('@jsquash/oxipng');
    buf = await optimise(buf, { level: Math.max(1, Math.min(6, spec.pngOptimize < 0 ? 2 : spec.pngOptimize)), interlace: false, optimiseAlpha: true });
  }
  return new Blob([buf], { type: 'image/png' });
}

async function quantize(data: ImageData, colors: number, dither: boolean): Promise<ImageData> {
  const iq = await import('image-q');
  const pc = iq.utils.PointContainer.fromUint8Array(data.data, data.width, data.height);
  const palette = await iq.buildPalette([pc], { colors, paletteQuantization: 'wuquant', colorDistanceFormula: 'euclidean-bt709' });
  const out = await iq.applyPalette(pc, palette, {
    imageQuantization: dither ? 'floyd-steinberg' : 'nearest',
    colorDistanceFormula: 'euclidean-bt709',
  });
  return new ImageData(new Uint8ClampedArray(out.toUint8Array()), data.width, data.height);
}

async function encodeJpeg(s: Surface, quality: number, spec: OutputSpec): Promise<Blob> {
  const flat = flatten(s, spec.background);
  const { encode } = await import('@jsquash/jpeg');
  const buf = await encode(readPixels(flat), {
    quality: clampQ(quality),
    progressive: spec.jpegProgressive,
    baseline: !spec.jpegProgressive,
    optimize_coding: true,
    chroma_subsample: spec.jpegChroma === '444' ? 1 : 2,
    auto_subsample: false,
    trellis_multipass: false,
    trellis_opt_zero: false,
    trellis_opt_table: false,
    trellis_loops: 1,
  });
  return new Blob([buf], { type: 'image/jpeg' });
}

async function encodeWebp(s: Surface, quality: number, spec: OutputSpec): Promise<Blob> {
  const { encode } = await import('@jsquash/webp');
  const buf = await encode(readPixels(s), {
    quality: clampQ(quality),
    lossless: spec.lossless ? 1 : 0,
    method: Math.max(0, Math.min(6, Math.round(spec.effort * 0.6))),
    use_sharp_yuv: quality >= 85 ? 1 : 0,
    exact: 0,
  });
  return new Blob([buf], { type: 'image/webp' });
}

async function encodeAvif(s: Surface, quality: number, spec: OutputSpec): Promise<Blob> {
  const { encode } = await import('@jsquash/avif');
  const speed = Math.max(0, Math.min(10, 10 - Math.round(spec.effort)));
  const buf = await encode(readPixels(s), {
    quality: clampQ(quality),
    lossless: spec.lossless,
    speed: Math.max(4, speed),
    subsample: spec.jpegChroma === '444' ? 3 : 1,
  });
  return new Blob([buf], { type: 'image/avif' });
}

async function encodeJxl(s: Surface, quality: number, spec: OutputSpec): Promise<Blob> {
  const { encode } = await import('@jsquash/jxl');
  const buf = await encode(readPixels(s), {
    quality: spec.lossless ? 100 : clampQ(quality),
    lossless: spec.lossless,
    effort: Math.max(1, Math.min(9, Math.round(spec.effort))),
  });
  return new Blob([buf], { type: 'image/jxl' });
}

async function encodeGif(s: Surface, spec: OutputSpec): Promise<Blob> {
  const { GIFEncoder, quantize: q, applyPalette } = await import('gifenc');
  const data = readPixels(s);
  const colors = spec.pngColors > 1 ? Math.min(256, spec.pngColors) : 256;
  const alpha = surfaceHasAlpha(s);
  const palette = q(data.data, colors, { format: alpha ? 'rgba4444' : 'rgb565', oneBitAlpha: alpha });
  const index = applyPalette(data.data, palette, alpha ? 'rgba4444' : 'rgb565');
  const gif = GIFEncoder();
  const transparentIndex = alpha ? palette.findIndex((c: number[]) => c[3] === 0) : -1;
  gif.writeFrame(index, data.width, data.height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

function encodeBmp(s: Surface, spec: OutputSpec): Blob {
  const flat = flatten(s, spec.background);
  const { width: w, height: h, data } = readPixels(flat);
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x4d42, true);
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, rowSize * h, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + x * 3;
      out[o] = data[i + 2];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

async function encodeTiff(s: Surface): Promise<Blob> {
  const mod = await import('utif2');
  const UTIF = mod.default ?? mod;
  const d = readPixels(s);
  const buf = UTIF.encodeImage(new Uint8Array(d.data.buffer), d.width, d.height);
  return new Blob([buf], { type: 'image/tiff' });
}

export async function encodeIco(s: Surface, sizes: number[]): Promise<Blob> {
  const list = [...new Set(sizes.filter((n) => n > 0 && n <= 256))].sort((a, b) => a - b);
  const pngs: Uint8Array[] = [];
  for (const size of list) {
    const c = createSurface(size, size);
    const ctx = ctxOf(c);
    ctx.imageSmoothingQuality = 'high';
    const k = Math.min(size / s.width, size / s.height);
    const w = s.width * k;
    const h = s.height * k;
    ctx.drawImage(s, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await c.convertToBlob({ type: 'image/png' });
    pngs.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const headerSize = 6 + 16 * list.length;
  const total = headerSize + pngs.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, list.length, true);
  let offset = headerSize;
  list.forEach((size, i) => {
    const e = 6 + i * 16;
    out[e] = size >= 256 ? 0 : size;
    out[e + 1] = size >= 256 ? 0 : size;
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, pngs[i].length, true);
    dv.setUint32(e + 12, offset, true);
    out.set(pngs[i], offset);
    offset += pngs[i].length;
  });
  return new Blob([out], { type: 'image/x-icon' });
}

async function encodeAt(s: Surface, format: Format, quality: number, spec: OutputSpec): Promise<Blob> {
  switch (format) {
    case 'jpeg':
      return encodeJpeg(s, quality, spec);
    case 'png':
      return encodePng(s, spec);
    case 'webp':
      return encodeWebp(s, quality, spec);
    case 'avif':
      return encodeAvif(s, quality, spec);
    case 'jxl':
      return encodeJxl(s, quality, spec);
    case 'gif':
      return encodeGif(s, spec);
    case 'bmp':
      return encodeBmp(s, spec);
    case 'tiff':
      return encodeTiff(s);
    case 'ico':
      return encodeIco(s, spec.icoSizes);
  }
}

async function encodeIntermediate(s: Surface, srcMime: string): Promise<Blob> {
  const alpha = surfaceHasAlpha(s);
  const src = formatFromMime(srcMime);
  if (!alpha && (src === 'jpeg' || src === 'webp' || src === 'avif' || src === 'jxl' || src === null)) {
    const jpeg = await nativeBlob(s, 'image/jpeg', 0.95);
    if (jpeg) return jpeg;
  }
  const png = await nativeBlob(s, 'image/png');
  if (png) return png;
  return new Blob([await (await import('@jsquash/png')).encode(readPixels(s))], { type: 'image/png' });
}

export function resolveFormat(spec: OutputSpec, srcMime: string): Format | 'auto' {
  if (spec.format === 'original') {
    const f = formatFromMime(srcMime);
    return f && f !== 'ico' ? f : 'png';
  }
  return spec.format;
}

export interface EncodeResult {
  blob: Blob;
  surface: Surface;
  note?: string;
}

export async function encodeSurface(s: Surface, spec: OutputSpec, srcMime: string): Promise<EncodeResult> {
  const format = resolveFormat(spec, srcMime);
  if (format === 'auto') return { blob: await encodeIntermediate(s, srcMime), surface: s };
  const info = formatById(format);
  const target = spec.targetKB && spec.targetKB > 0 ? spec.targetKB * 1024 : 0;
  if (!target) return { blob: await encodeAt(s, format, spec.quality, spec), surface: s };

  if (!info.lossy) {
    if (format !== 'png') return { blob: await encodeAt(s, format, spec.quality, spec), surface: s };
    let blob = await encodeAt(s, format, spec.quality, spec);
    for (const colors of [256, 128, 64, 32, 16]) {
      if (blob.size <= target) break;
      blob = await encodeAt(s, format, spec.quality, { ...spec, pngColors: colors });
    }
    return fitByDownscale(s, format, spec, target, blob, (surf, sp) => encodeAt(surf, format, spec.quality, { ...sp, pngColors: 64 }));
  }

  const lossyOnly = { ...spec, lossless: false };
  let lo = 5;
  let hi = Math.min(95, Math.max(spec.quality, 60));
  let best: Blob | null = null;
  let smallest: Blob | null = null;
  const top = await encodeAt(s, format, hi, lossyOnly);
  if (top.size <= target) return { blob: top, surface: s };
  smallest = top;
  for (let i = 0; i < 7 && lo <= hi; i++) {
    const q = Math.round((lo + hi) / 2);
    const b = await encodeAt(s, format, q, lossyOnly);
    if (!smallest || b.size < smallest.size) smallest = b;
    if (b.size <= target) {
      best = b;
      lo = q + 1;
    } else hi = q - 1;
  }
  if (best) return { blob: best, surface: s };
  return fitByDownscale(s, format, lossyOnly, target, smallest!, (surf, sp) => encodeAt(surf, format, 40, sp));
}

async function fitByDownscale(
  s: Surface,
  _format: Format,
  spec: OutputSpec,
  target: number,
  fallback: Blob,
  enc: (s: Surface, spec: OutputSpec) => Promise<Blob>,
): Promise<EncodeResult> {
  if (!spec.allowDownscale) {
    return { blob: fallback, surface: s, note: 'Ukuran target tidak tercapai tanpa memperkecil dimensi. Aktifkan "Boleh perkecil dimensi".' };
  }
  let scale = Math.sqrt(target / fallback.size) * 0.95;
  let blob = fallback;
  let surf = s;
  for (let i = 0; i < 6 && blob.size > target; i++) {
    surf = createSurface(Math.max(16, s.width * scale), Math.max(16, s.height * scale));
    const c = ctxOf(surf);
    c.imageSmoothingQuality = 'high';
    c.drawImage(s, 0, 0, surf.width, surf.height);
    blob = await enc(surf, spec);
    scale *= Math.max(0.5, Math.sqrt(target / blob.size) * 0.95);
  }
  return {
    blob,
    surface: surf,
    note: blob.size > target ? 'Target terlalu kecil, ini hasil terkecil yang bisa dicapai.' : `Dimensi diperkecil ke ${surf.width}×${surf.height} agar muat target.`,
  };
}
