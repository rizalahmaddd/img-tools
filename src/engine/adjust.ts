import { blurSurface, createSurface, ctxOf, fromPixels, readPixels, type Surface } from './canvas';
import type { AdjustParams } from './types';

export const neutralAdjust: AdjustParams = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: false,
  fade: 0,
  sharpen: 0,
  blur: 0,
  vignette: 0,
  grain: 0,
};

export function isNeutral(p: Partial<AdjustParams>): boolean {
  return (Object.keys(neutralAdjust) as (keyof AdjustParams)[]).every((k) => (p[k] ?? neutralAdjust[k]) === neutralAdjust[k]);
}

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function colorPass(data: ImageData, p: AdjustParams, scale: number) {
  const d = data.data;
  const { width: w, height: h } = data;
  const lut = new Uint8ClampedArray(256);
  const exp = Math.pow(2, p.exposure / 50);
  const bright = p.brightness * 1.28;
  const c = p.contrast / 100;
  const contrast = c >= 0 ? 1 + c * 1.5 : 1 + c;
  const fade = p.fade / 100;
  for (let i = 0; i < 256; i++) {
    let v = i * exp + bright;
    v = (v - 128) * contrast + 128;
    v = v * (1 - fade * 0.25) + fade * 40;
    lut[i] = v;
  }
  const sat = 1 + p.saturation / 100;
  const vib = p.vibrance / 100;
  const temp = p.temperature / 100;
  const tint = p.tint / 100;
  const hl = p.highlights / 100;
  const sh = p.shadows / 100;
  const gray = p.grayscale / 100;
  const sepia = p.sepia / 100;
  const hueRad = (p.hue * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const hm = p.hue
    ? [
        0.213 + cosH * 0.787 - sinH * 0.213,
        0.715 - cosH * 0.715 - sinH * 0.715,
        0.072 - cosH * 0.072 + sinH * 0.928,
        0.213 - cosH * 0.213 + sinH * 0.143,
        0.715 + cosH * 0.285 + sinH * 0.14,
        0.072 - cosH * 0.072 - sinH * 0.283,
        0.213 - cosH * 0.213 - sinH * 0.787,
        0.715 - cosH * 0.715 + sinH * 0.715,
        0.072 + cosH * 0.928 + sinH * 0.072,
      ]
    : null;
  const vig = p.vignette / 100;
  const grain = p.grain / 100;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const grainScale = Math.max(1, Math.round(scale * Math.max(1, Math.min(w, h) / 1200)));

  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      let r = lut[d[i]];
      let g = lut[d[i + 1]];
      let b = lut[d[i + 2]];
      if (hl || sh) {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const lift = sh * Math.pow(1 - l, 2) * 80 + hl * Math.pow(l, 2) * 80;
        r += lift;
        g += lift;
        b += lift;
      }
      if (temp || tint) {
        r += temp * 30;
        b -= temp * 30;
        g += tint * 25;
      }
      if (hm) {
        const nr = r * hm[0] + g * hm[1] + b * hm[2];
        const ng = r * hm[3] + g * hm[4] + b * hm[5];
        const nb = r * hm[6] + g * hm[7] + b * hm[8];
        r = nr;
        g = ng;
        b = nb;
      }
      if (sat !== 1 || vib) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        let s = sat;
        if (vib) {
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          const curSat = mx > 0 ? (mx - mn) / mx : 0;
          s *= 1 + vib * (1 - curSat);
        }
        r = l + (r - l) * s;
        g = l + (g - l) * s;
        b = l + (b - l) * s;
      }
      if (sepia) {
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        r += (sr - r) * sepia;
        g += (sg - g) * sepia;
        b += (sb - b) * sepia;
      }
      if (gray) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r += (l - r) * gray;
        g += (l - g) * gray;
        b += (l - b) * gray;
      }
      if (p.invert) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
      if (vig) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
        const f = 1 - vig * Math.pow(Math.max(0, dist - 0.35) / 0.65, 2) * 0.9;
        r *= f;
        g *= f;
        b *= f;
      }
      if (grain) {
        const n = (hash(Math.floor(x / grainScale), Math.floor(y / grainScale)) - 0.5) * grain * 70;
        r += n;
        g += n;
        b += n;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }
}

function sharpenPass(s: Surface, amount: number, scale: number): Surface {
  const radius = Math.max(0.6, 1.2 * scale);
  const base = readPixels(s);
  const blurred = readPixels(blurSurface(s, radius));
  const a = (amount / 100) * 1.6;
  const d = base.data;
  const b = blurred.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - b[i]) * a;
    d[i + 1] = d[i + 1] + (d[i + 1] - b[i + 1]) * a;
    d[i + 2] = d[i + 2] + (d[i + 2] - b[i + 2]) * a;
  }
  return fromPixels(base);
}

export function applyAdjust(src: Surface, partial: Partial<AdjustParams>, scale = 1): Surface {
  const p = { ...neutralAdjust, ...partial };
  if (isNeutral(p)) return src;
  let s = src;
  if (p.blur > 0) s = blurSurface(s, (p.blur / 100) * 0.02 * Math.min(s.width, s.height));
  const needsColor =
    p.exposure || p.brightness || p.contrast || p.highlights || p.shadows || p.saturation || p.vibrance || p.temperature || p.tint || p.hue || p.grayscale || p.sepia || p.invert || p.fade || p.vignette || p.grain;
  if (needsColor) {
    const data = readPixels(s);
    colorPass(data, p, scale);
    s = fromPixels(data);
  }
  if (p.sharpen > 0) s = sharpenPass(s, p.sharpen, scale);
  return s === src ? (() => {
    const copy = createSurface(src.width, src.height);
    ctxOf(copy).drawImage(src, 0, 0);
    return copy;
  })() : s;
}

export interface FilterPreset {
  id: string;
  label: string;
  params: Partial<AdjustParams>;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Asli', params: {} },
  { id: 'vivid', label: 'Cerah', params: { saturation: 25, vibrance: 20, contrast: 12, exposure: 4 } },
  { id: 'warm', label: 'Hangat', params: { temperature: 35, saturation: 8, highlights: -5 } },
  { id: 'cool', label: 'Sejuk', params: { temperature: -30, tint: -4, contrast: 6 } },
  { id: 'film', label: 'Film', params: { fade: 35, contrast: -8, saturation: -12, temperature: 12, grain: 25 } },
  { id: 'vintage', label: 'Vintage', params: { sepia: 35, fade: 30, vignette: 40, contrast: -10, saturation: -20 } },
  { id: 'drama', label: 'Dramatis', params: { contrast: 35, shadows: -15, highlights: -20, saturation: -10, vignette: 35, sharpen: 25 } },
  { id: 'soft', label: 'Lembut', params: { contrast: -18, highlights: -10, shadows: 20, fade: 15, saturation: -5 } },
  { id: 'bw', label: 'Hitam Putih', params: { grayscale: 100, contrast: 10 } },
  { id: 'noir', label: 'Noir', params: { grayscale: 100, contrast: 45, vignette: 45, grain: 20 } },
  { id: 'sepia', label: 'Sepia', params: { sepia: 85, contrast: 5 } },
  { id: 'matte', label: 'Matte', params: { fade: 45, contrast: -12, shadows: 15 } },
  { id: 'pop', label: 'Pop', params: { saturation: 55, contrast: 25, sharpen: 20 } },
  { id: 'invert', label: 'Negatif', params: { invert: true } },
];
