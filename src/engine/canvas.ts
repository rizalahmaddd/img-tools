export type Surface = OffscreenCanvas;
export type Ctx = OffscreenCanvasRenderingContext2D;

export function createSurface(w: number, h: number): Surface {
  return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function ctxOf(s: Surface, readback = false): Ctx {
  const ctx = s.getContext('2d', { willReadFrequently: readback }) as Ctx | null;
  if (!ctx) throw new Error('Browser kehabisan memori untuk kanvas. Coba gambar yang lebih kecil.');
  return ctx;
}

export function surfaceFrom(src: CanvasImageSource & { width: number; height: number }): Surface {
  const s = createSurface(src.width, src.height);
  ctxOf(s).drawImage(src, 0, 0);
  return s;
}

export function readPixels(s: Surface): ImageData {
  return ctxOf(s, true).getImageData(0, 0, s.width, s.height);
}

export function fromPixels(data: ImageData): Surface {
  const s = createSurface(data.width, data.height);
  ctxOf(s).putImageData(data, 0, 0);
  return s;
}

export function hasAlpha(data: ImageData): boolean {
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

export function surfaceHasAlpha(s: Surface): boolean {
  const step = Math.max(1, Math.floor(Math.sqrt((s.width * s.height) / 4_000_000)));
  if (step === 1) return hasAlpha(readPixels(s));
  const small = createSurface(Math.ceil(s.width / step), Math.ceil(s.height / step));
  const c = ctxOf(small, true);
  c.imageSmoothingEnabled = false;
  c.drawImage(s, 0, 0, small.width, small.height);
  return hasAlpha(c.getImageData(0, 0, small.width, small.height));
}

export function flatten(s: Surface, color: string): Surface {
  const out = createSurface(s.width, s.height);
  const c = ctxOf(out);
  c.fillStyle = color;
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(s, 0, 0);
  return out;
}

export function fitArea(w: number, h: number, maxArea: number, maxDim: number) {
  let scale = 1;
  if (w * h > maxArea) scale = Math.sqrt(maxArea / (w * h));
  if (w * scale > maxDim) scale = maxDim / w;
  if (h * scale > maxDim) scale = Math.min(scale, maxDim / h);
  return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)), scaled: scale < 1 };
}

let filterSupport: boolean | null = null;

export function supportsCtxFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const a = createSurface(9, 1);
    const c = ctxOf(a, true);
    c.fillStyle = '#000';
    c.fillRect(0, 0, 9, 1);
    c.fillStyle = '#fff';
    c.fillRect(4, 0, 1, 1);
    const b = createSurface(9, 1);
    const cb = ctxOf(b, true);
    cb.filter = 'blur(2px)';
    cb.drawImage(a, 0, 0);
    const px = cb.getImageData(3, 0, 1, 1).data;
    filterSupport = px[0] > 0 && px[0] < 255;
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

function boxBlurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let ch = 0; ch < 4; ch++) {
      let ti = row + ch;
      let li = ti;
      let ri = ti + r * 4;
      const fv = src[ti];
      const lv = src[row + (w - 1) * 4 + ch];
      let val = (r + 1) * fv;
      for (let j = 0; j < r; j++) val += src[row + Math.min(j, w - 1) * 4 + ch];
      for (let x = 0; x < w; x++) {
        const right = x + r < w ? src[ri] : lv;
        const left = x - r - 1 >= 0 ? src[li] : fv;
        val += right - left;
        dst[ti] = val * iarr;
        if (x + r < w) ri += 4;
        if (x - r - 1 >= 0) li += 4;
        ti += 4;
      }
    }
  }
}

function boxBlurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1);
  const stride = w * 4;
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 4; ch++) {
      const col = x * 4 + ch;
      const fv = src[col];
      const lv = src[col + (h - 1) * stride];
      let val = (r + 1) * fv;
      for (let j = 0; j < r; j++) val += src[col + Math.min(j, h - 1) * stride];
      let ti = col;
      let li = col;
      let ri = col + r * stride;
      for (let y = 0; y < h; y++) {
        const bottom = y + r < h ? src[ri] : lv;
        const top = y - r - 1 >= 0 ? src[li] : fv;
        val += bottom - top;
        dst[ti] = val * iarr;
        if (y + r < h) ri += stride;
        if (y - r - 1 >= 0) li += stride;
        ti += stride;
      }
    }
  }
}

export function blurPixels(data: ImageData, radius: number): ImageData {
  if (radius < 0.5) return data;
  const { width: w, height: h } = data;
  const sigma = radius / 2;
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes = Array.from({ length: n }, (_, i) => (i < m ? wl : wl + 2));
  const a = new Uint8ClampedArray(data.data);
  const b = new Uint8ClampedArray(a.length);
  for (const s of sizes) {
    const r = Math.max(0, Math.floor((s - 1) / 2));
    if (r === 0) continue;
    boxBlurH(a, b, w, h, r);
    boxBlurV(b, a, w, h, r);
  }
  return new ImageData(a, w, h);
}

export function blurSurface(s: Surface, radius: number): Surface {
  if (radius < 0.5) return s;
  if (supportsCtxFilter()) {
    const pad = Math.ceil(radius * 2);
    const out = createSurface(s.width, s.height);
    const c = ctxOf(out);
    c.filter = `blur(${radius}px)`;
    // Edge pixels get stretched outward first so the blur doesn't fade to transparent at the borders.
    const big = createSurface(s.width + pad * 2, s.height + pad * 2);
    const bc = ctxOf(big);
    bc.drawImage(s, pad, pad);
    bc.drawImage(s, 0, 0, 1, s.height, 0, pad, pad, s.height);
    bc.drawImage(s, s.width - 1, 0, 1, s.height, s.width + pad, pad, pad, s.height);
    bc.drawImage(big, 0, pad, big.width, 1, 0, 0, big.width, pad);
    bc.drawImage(big, 0, pad + s.height - 1, big.width, 1, 0, pad + s.height, big.width, pad);
    c.drawImage(big, -pad, -pad);
    return out;
  }
  const maxWork = 6_000_000;
  const area = s.width * s.height;
  if (area > maxWork && radius > 4) {
    const k = Math.sqrt(maxWork / area);
    const small = createSurface(s.width * k, s.height * k);
    const sc = ctxOf(small);
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(s, 0, 0, small.width, small.height);
    const blurred = fromPixels(blurPixels(readPixels(small), radius * k));
    const out = createSurface(s.width, s.height);
    const oc = ctxOf(out);
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(blurred, 0, 0, out.width, out.height);
    return out;
  }
  return fromPixels(blurPixels(readPixels(s), radius));
}

export function anchorOffset(anchor: string, freeW: number, freeH: number) {
  const ax = anchor[1] === 'l' ? 0 : anchor[1] === 'r' ? 1 : 0.5;
  const ay = anchor[0] === 't' ? 0 : anchor[0] === 'b' ? 1 : 0.5;
  return { x: freeW * ax, y: freeH * ay };
}
