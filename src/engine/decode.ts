import { createSurface, ctxOf, fitArea, fromPixels, type Surface } from './canvas';
import { sniffMime } from './formats';

export class UnsupportedImageError extends Error {}

async function viaBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
}

async function decodeHeic(blob: Blob): Promise<Surface> {
  const { heicTo } = await import('heic-to');
  const bmp = await heicTo({ blob, type: 'bitmap' });
  const s = createSurface(bmp.width, bmp.height);
  ctxOf(s).drawImage(bmp, 0, 0);
  bmp.close();
  return s;
}

async function decodeTiff(blob: Blob): Promise<Surface> {
  const UTIF = (await import('utif2')).default ?? (await import('utif2'));
  const buf = await blob.arrayBuffer();
  const ifds = UTIF.decode(buf);
  const page = ifds.find((i: { width?: number }) => (i.width ?? 0) > 0) ?? ifds[0];
  UTIF.decodeImage(buf, page);
  const rgba = UTIF.toRGBA8(page);
  const w = page.width as number;
  const h = page.height as number;
  return fromPixels(new ImageData(new Uint8ClampedArray(rgba), w, h));
}

async function decodeWasm(blob: Blob, mime: string): Promise<Surface> {
  const buf = await blob.arrayBuffer();
  let data: ImageData | null = null;
  if (mime === 'image/avif') data = await (await import('@jsquash/avif')).decode(buf);
  else if (mime === 'image/jxl') data = await (await import('@jsquash/jxl')).decode(buf);
  else if (mime === 'image/webp') data = await (await import('@jsquash/webp')).decode(buf);
  else if (mime === 'image/jpeg') data = await (await import('@jsquash/jpeg')).decode(buf);
  else if (mime === 'image/png') data = await (await import('@jsquash/png')).decode(buf);
  if (!data) throw new UnsupportedImageError(`Format ${mime} tidak bisa dibaca`);
  return fromPixels(data);
}

export interface Decoded {
  surface: Surface;
  mime: string;
  downscaled: boolean;
  originalWidth: number;
  originalHeight: number;
}

export async function decode(blob: Blob, maxArea = Infinity, maxDim = Infinity): Promise<Decoded> {
  const mime = await sniffMime(blob);
  if (mime === 'image/svg+xml') throw new UnsupportedImageError('SVG perlu dirender dulu saat diimpor');
  let surface: Surface | null = null;
  let bmp: ImageBitmap | null = null;
  if (mime !== 'image/heic' && mime !== 'image/tiff' && mime !== 'image/jxl') {
    try {
      bmp = await viaBitmap(blob);
    } catch {
      bmp = null;
    }
  }
  if (bmp) {
    const ow = bmp.width;
    const oh = bmp.height;
    const fit = fitArea(ow, oh, maxArea, maxDim);
    if (fit.scaled) {
      const small = await createImageBitmap(bmp, { resizeWidth: fit.w, resizeHeight: fit.h, resizeQuality: 'high' });
      bmp.close();
      bmp = small;
    }
    surface = createSurface(bmp.width, bmp.height);
    ctxOf(surface).drawImage(bmp, 0, 0);
    bmp.close();
    return { surface, mime, downscaled: fit.scaled, originalWidth: ow, originalHeight: oh };
  }
  if (mime === 'image/heic') surface = await decodeHeic(blob);
  else if (mime === 'image/tiff') surface = await decodeTiff(blob);
  else surface = await decodeWasm(blob, mime).catch(() => {
    throw new UnsupportedImageError('File ini bukan gambar yang didukung atau rusak');
  });
  const ow = surface.width;
  const oh = surface.height;
  const fit = fitArea(ow, oh, maxArea, maxDim);
  if (fit.scaled) {
    const small = createSurface(fit.w, fit.h);
    const c = ctxOf(small);
    c.imageSmoothingQuality = 'high';
    c.drawImage(surface, 0, 0, fit.w, fit.h);
    surface = small;
  }
  return { surface, mime, downscaled: fit.scaled, originalWidth: ow, originalHeight: oh };
}

export function needsNormalize(mime: string): boolean {
  return ['image/heic', 'image/tiff', 'image/jxl', 'image/svg+xml', 'image/x-icon', 'image/bmp'].includes(mime);
}
