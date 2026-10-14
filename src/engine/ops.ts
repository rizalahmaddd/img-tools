import picaFactory from 'pica';
import { applyAdjust } from './adjust';
import { anchorOffset, blurSurface, createSurface, ctxOf, readPixels, type Surface } from './canvas';
import type { AspectCropOp, CensorOp, CropOp, FlipOp, FrameOp, MaskOp, Op, ResizeFilter, ResizeOp, RotateOp, TrimOp, WatermarkOp } from './types';

type Pica = ReturnType<typeof picaFactory>;
let pica: Pica | null = null;

function getPica(): Pica {
  if (!pica) {
    const inWorker = typeof window === 'undefined';
    pica = picaFactory({ features: inWorker ? ['js', 'wasm'] : ['js', 'wasm', 'ww'] });
  }
  return pica;
}

export async function resizeTo(src: Surface, w: number, h: number, filter: ResizeFilter = 'mks2013'): Promise<Surface> {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (w === src.width && h === src.height) return src;
  const out = createSurface(w, h);
  try {
    await getPica().resize(src, out, { filter: w > src.width ? 'lanczos3' : filter });
  } catch {
    const c = ctxOf(out);
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, w, h);
  }
  return out;
}

async function resize(src: Surface, op: ResizeOp): Promise<Surface> {
  const sw = src.width;
  const sh = src.height;
  const ratio = sw / sh;
  let w = sw;
  let h = sh;
  let boxW = 0;
  let boxH = 0;
  switch (op.mode) {
    case 'percent':
      w = (sw * (op.percent ?? 100)) / 100;
      h = (sh * (op.percent ?? 100)) / 100;
      break;
    case 'width':
      w = op.width ?? sw;
      h = w / ratio;
      break;
    case 'height':
      h = op.height ?? sh;
      w = h * ratio;
      break;
    case 'long': {
      const k = (op.side ?? Math.max(sw, sh)) / Math.max(sw, sh);
      w = sw * k;
      h = sh * k;
      break;
    }
    case 'short': {
      const k = (op.side ?? Math.min(sw, sh)) / Math.min(sw, sh);
      w = sw * k;
      h = sh * k;
      break;
    }
    case 'exact':
      w = op.width || sw;
      h = op.height || sh;
      break;
    case 'contain': {
      boxW = op.width || sw;
      boxH = op.height || sh;
      const k = Math.min(boxW / sw, boxH / sh);
      w = sw * k;
      h = sh * k;
      break;
    }
    case 'cover': {
      boxW = op.width || sw;
      boxH = op.height || sh;
      const k = Math.max(boxW / sw, boxH / sh);
      w = sw * k;
      h = sh * k;
      break;
    }
  }
  if (!op.enlarge && (w > sw || h > sh)) {
    if (op.mode === 'exact') {
      w = Math.min(w, sw);
      h = Math.min(h, sh);
    } else if (op.mode === 'contain' || op.mode === 'cover') {
      const k = Math.min(1, sw / w, sh / h);
      w *= k;
      h *= k;
      boxW = Math.min(boxW, Math.round(boxW * k));
      boxH = Math.min(boxH, Math.round(boxH * k));
    } else {
      w = sw;
      h = sh;
    }
  }
  const scaled = await resizeTo(src, w, h, op.filter);
  if (op.mode === 'contain' && op.background !== undefined && boxW && boxH && (Math.round(w) !== boxW || Math.round(h) !== boxH)) {
    const out = createSurface(boxW, boxH);
    const c = ctxOf(out);
    if (op.background && op.background !== 'transparent') {
      c.fillStyle = op.background;
      c.fillRect(0, 0, boxW, boxH);
    }
    const off = anchorOffset(op.anchor ?? 'mc', boxW - scaled.width, boxH - scaled.height);
    c.drawImage(scaled, Math.round(off.x), Math.round(off.y));
    return out;
  }
  if (op.mode === 'cover' && boxW && boxH) {
    const out = createSurface(boxW, boxH);
    const off = anchorOffset(op.anchor ?? 'mc', scaled.width - boxW, scaled.height - boxH);
    ctxOf(out).drawImage(scaled, -Math.round(off.x), -Math.round(off.y));
    return out;
  }
  return scaled;
}

function crop(src: Surface, op: CropOp): Surface {
  const k = op.unit === 'fraction' ? [src.width, src.height] : [1, 1];
  const x = Math.max(0, Math.round(op.x * k[0]));
  const y = Math.max(0, Math.round(op.y * k[1]));
  const w = Math.max(1, Math.min(src.width - x, Math.round(op.w * k[0])));
  const h = Math.max(1, Math.min(src.height - y, Math.round(op.h * k[1])));
  const out = createSurface(w, h);
  ctxOf(out).drawImage(src, -x, -y);
  return out;
}

function aspectCrop(src: Surface, op: AspectCropOp): Surface {
  const r = op.ratio;
  let w = src.width;
  let h = w / r;
  if (h > src.height) {
    h = src.height;
    w = h * r;
  }
  const off = anchorOffset(op.anchor, src.width - w, src.height - h);
  return crop(src, { type: 'crop', unit: 'px', x: off.x, y: off.y, w, h });
}

export function rotatedBounds(w: number, h: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: w * c + h * s, h: w * s + h * c };
}

export function inscribedScale(w: number, h: number, deg: number) {
  const rad = Math.abs(((deg % 180) * Math.PI) / 180);
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  if (sin < 1e-6) return 1;
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 1e-10) {
    const x = 0.5 * shortSide;
    const wr = w >= h ? x / sin : x / cos;
    const hr = w >= h ? x / cos : x / sin;
    return Math.min(wr / w, hr / h);
  }
  const cos2a = cos * cos - sin * sin;
  const wr = (w * cos - h * sin) / cos2a;
  const hr = (h * cos - w * sin) / cos2a;
  return Math.min(wr / w, hr / h);
}

function rotate(src: Surface, op: RotateOp): Surface {
  const angle = ((op.angle % 360) + 360) % 360;
  if (angle === 0) return src;
  const right = angle % 90 === 0;
  const b = rotatedBounds(src.width, src.height, angle);
  let w = Math.round(b.w);
  let h = Math.round(b.h);
  if (!right && op.fill) {
    const q = Math.round(angle / 90);
    const bw = q % 2 ? src.height : src.width;
    const bh = q % 2 ? src.width : src.height;
    const k = inscribedScale(bw, bh, angle - q * 90);
    w = Math.floor(bw * k);
    h = Math.floor(bh * k);
  }
  const out = createSurface(w, h);
  const c = ctxOf(out);
  if (!right && !op.fill && op.background !== 'transparent') {
    c.fillStyle = op.background;
    c.fillRect(0, 0, w, h);
  }
  c.imageSmoothingQuality = 'high';
  c.translate(w / 2, h / 2);
  c.rotate((angle * Math.PI) / 180);
  c.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

function flip(src: Surface, op: FlipOp): Surface {
  if (!op.h && !op.v) return src;
  const out = createSurface(src.width, src.height);
  const c = ctxOf(out);
  c.translate(op.h ? src.width : 0, op.v ? src.height : 0);
  c.scale(op.h ? -1 : 1, op.v ? -1 : 1);
  c.drawImage(src, 0, 0);
  return out;
}

const FONT_STACKS: Record<string, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  rounded: '"SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
  hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  impact: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
};

export const fontStack = (f: string) => FONT_STACKS[f] ?? FONT_STACKS.sans;

function fillVars(text: string, vars: Record<string, string> = {}) {
  return text.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

async function watermark(src: Surface, op: WatermarkOp, vars?: Record<string, string>): Promise<Surface> {
  const out = createSurface(src.width, src.height);
  const c = ctxOf(out);
  c.drawImage(src, 0, 0);
  const base = Math.min(src.width, src.height);
  const margin = (op.margin / 100) * base;

  let mark: Surface;
  if (op.kind === 'image') {
    if (!op.image) return out;
    const bmp = await createImageBitmap(op.image);
    const w = Math.max(1, (op.size / 100) * src.width);
    const h = (w * bmp.height) / bmp.width;
    mark = createSurface(w, h);
    const mc = ctxOf(mark);
    mc.imageSmoothingQuality = 'high';
    mc.drawImage(bmp, 0, 0, w, h);
    bmp.close();
  } else {
    const text = fillVars(op.text, { ...vars, ...op.vars });
    if (!text.trim()) return out;
    const lines = text.split('\n');
    const fontSize = Math.max(6, (op.size / 100) * base);
    const font = `${op.italic ? 'italic ' : ''}${op.bold ? '700 ' : '400 '}${fontSize}px ${fontStack(op.font)}`;
    c.font = font;
    const lineH = fontSize * 1.2;
    const textW = Math.max(...lines.map((l) => c.measureText(l).width));
    const padX = op.box ? fontSize * 0.5 : 0;
    const padY = op.box ? fontSize * 0.3 : 0;
    const strokeW = (op.outline / 100) * fontSize * 0.3;
    const extra = strokeW + (op.shadow ? fontSize * 0.15 : 0);
    mark = createSurface(textW + padX * 2 + extra * 2, lineH * lines.length + padY * 2 + extra * 2);
    const mc = ctxOf(mark);
    if (op.box) {
      mc.fillStyle = op.boxColor;
      const r = Math.min(fontSize * 0.35, mark.height / 2);
      mc.beginPath();
      mc.roundRect(extra, extra, mark.width - extra * 2, mark.height - extra * 2, r);
      mc.fill();
    }
    mc.font = font;
    mc.textBaseline = 'middle';
    mc.textAlign = 'center';
    mc.lineJoin = 'round';
    if (op.shadow) {
      mc.shadowColor = 'rgba(0,0,0,0.45)';
      mc.shadowBlur = fontSize * 0.12;
      mc.shadowOffsetY = fontSize * 0.04;
    }
    lines.forEach((line, i) => {
      const y = extra + padY + lineH * i + lineH / 2;
      if (strokeW > 0) {
        mc.strokeStyle = op.outlineColor;
        mc.lineWidth = strokeW * 2;
        mc.strokeText(line, mark.width / 2, y);
        mc.shadowColor = 'transparent';
      }
      mc.fillStyle = op.color;
      mc.fillText(line, mark.width / 2, y);
    });
  }

  c.globalAlpha = Math.max(0, Math.min(1, op.opacity / 100));
  const rad = (op.rotation * Math.PI) / 180;
  const drawAt = (cx: number, cy: number) => {
    c.save();
    c.translate(cx, cy);
    c.rotate(rad);
    c.drawImage(mark, -mark.width / 2, -mark.height / 2);
    c.restore();
  };
  if (op.position === 'tile') {
    const gap = (op.gap / 100) * base;
    const stepX = mark.width + gap;
    const stepY = mark.height + gap;
    const diag = Math.sqrt(src.width ** 2 + src.height ** 2);
    c.save();
    c.translate(src.width / 2, src.height / 2);
    c.rotate(rad);
    let row = 0;
    for (let y = -diag / 2; y < diag / 2 + stepY; y += stepY, row++) {
      const shift = row % 2 ? stepX / 2 : 0;
      for (let x = -diag / 2 - shift; x < diag / 2 + stepX; x += stepX) c.drawImage(mark, x, y);
    }
    c.restore();
  } else {
    const b = rotatedBounds(mark.width, mark.height, op.rotation);
    const off = anchorOffset(op.position, src.width - b.w - margin * 2, src.height - b.h - margin * 2);
    drawAt(margin + off.x + b.w / 2, margin + off.y + b.h / 2);
  }
  c.globalAlpha = 1;
  return out;
}

function frame(src: Surface, op: FrameOp): Surface {
  const base = Math.min(src.width, src.height);
  const pad = (op.padding / 100) * base;
  const border = (op.border / 100) * base * 0.25;
  let w = src.width + pad * 2;
  let h = src.height + pad * 2;
  if (op.aspect > 0) {
    if (w / h > op.aspect) h = w / op.aspect;
    else w = h * op.aspect;
  }
  w = Math.round(w);
  h = Math.round(h);
  const out = createSurface(w, h);
  const c = ctxOf(out);
  if (op.bgType === 'color') {
    c.fillStyle = op.bgColor;
    c.fillRect(0, 0, w, h);
  } else if (op.bgType === 'gradient') {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, op.bgColor);
    g.addColorStop(1, op.bgColor2);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  } else if (op.bgType === 'blur') {
    const k = Math.max(w / src.width, h / src.height);
    const small = createSurface(Math.max(1, (src.width * k) / 4), Math.max(1, (src.height * k) / 4));
    const sc = ctxOf(small);
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(src, 0, 0, small.width, small.height);
    const blurred = blurSurface(small, Math.max(2, ((op.blur / 100) * Math.min(small.width, small.height)) / 10));
    c.imageSmoothingQuality = 'high';
    c.drawImage(blurred, (w - src.width * k) / 2, (h - src.height * k) / 2, src.width * k, src.height * k);
    c.fillStyle = 'rgba(0,0,0,0.08)';
    c.fillRect(0, 0, w, h);
  }
  const r = (op.radius / 100) * base * 0.5;
  const piece = createSurface(src.width + border * 2, src.height + border * 2);
  const pc = ctxOf(piece);
  if (border > 0) {
    pc.beginPath();
    pc.roundRect(0, 0, piece.width, piece.height, r > 0 ? r + border : 0);
    pc.fillStyle = op.borderColor;
    pc.fill();
  }
  pc.save();
  pc.beginPath();
  pc.roundRect(border, border, src.width, src.height, r);
  pc.clip();
  if (border > 0) pc.clearRect(border, border, src.width, src.height);
  pc.drawImage(src, border, border);
  pc.restore();
  c.save();
  if (op.shadow > 0) {
    c.shadowColor = `rgba(0,0,0,${0.15 + op.shadow / 300})`;
    c.shadowBlur = (op.shadow / 100) * base * 0.08;
    c.shadowOffsetY = (op.shadow / 100) * base * 0.02;
  }
  c.drawImage(piece, Math.round((w - piece.width) / 2), Math.round((h - piece.height) / 2));
  c.restore();
  return out;
}

function regionPath(c: OffscreenCanvasRenderingContext2D, regions: CensorOp['regions']) {
  for (const r of regions) {
    if (r.shape === 'stroke') {
      if (r.points.length < 2) continue;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = r.size;
      c.beginPath();
      c.moveTo(r.points[0], r.points[1]);
      if (r.points.length === 2) c.lineTo(r.points[0] + 0.01, r.points[1]);
      for (let i = 2; i < r.points.length; i += 2) c.lineTo(r.points[i], r.points[i + 1]);
      c.stroke();
      c.restore();
    } else {
      c.beginPath();
      if (r.shape === 'ellipse') c.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2);
      else c.rect(r.x, r.y, r.w, r.h);
      c.fill();
    }
  }
}

function regionsBounds(regions: CensorOp['regions'], w: number, h: number) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of regions) {
    if (r.shape === 'stroke') {
      for (let i = 0; i < r.points.length; i += 2) {
        x0 = Math.min(x0, r.points[i] - r.size);
        x1 = Math.max(x1, r.points[i] + r.size);
        y0 = Math.min(y0, r.points[i + 1] - r.size);
        y1 = Math.max(y1, r.points[i + 1] + r.size);
      }
    } else {
      x0 = Math.min(x0, r.x, r.x + r.w);
      x1 = Math.max(x1, r.x, r.x + r.w);
      y0 = Math.min(y0, r.y, r.y + r.h);
      y1 = Math.max(y1, r.y, r.y + r.h);
    }
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function censorEffect(src: Surface, op: Pick<CensorOp, 'mode' | 'strength' | 'color'>, area: { x: number; y: number; w: number; h: number }, base: number): Surface {
  const s = Math.max(1, op.strength);
  const pad = op.mode === 'blur' ? Math.ceil((s / 100) * base * 0.08) : 0;
  const ax = Math.max(0, area.x - pad);
  const ay = Math.max(0, area.y - pad);
  const aw = Math.min(src.width - ax, area.w + pad * 2);
  const ah = Math.min(src.height - ay, area.h + pad * 2);
  const out = createSurface(src.width, src.height);
  const c = ctxOf(out);
  if (op.mode === 'solid') {
    c.fillStyle = op.color;
    c.fillRect(area.x, area.y, area.w, area.h);
    return out;
  }
  const piece = createSurface(aw, ah);
  ctxOf(piece).drawImage(src, -ax, -ay);
  if (op.mode === 'pixelate') {
    const block = Math.max(2, (s / 100) * base * 0.06);
    const small = createSurface(Math.max(1, aw / block), Math.max(1, ah / block));
    const sc = ctxOf(small);
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(piece, 0, 0, small.width, small.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(small, ax, ay, aw, ah);
  } else if (op.mode === 'blur') {
    const radius = Math.max(2, (s / 100) * base * 0.04);
    // A downscale before blurring destroys detail that a plain blur could leave recoverable.
    const small = createSurface(Math.max(1, aw / 4), Math.max(1, ah / 4));
    const sc = ctxOf(small);
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(piece, 0, 0, small.width, small.height);
    const blurred = blurSurface(small, radius / 4);
    c.imageSmoothingQuality = 'high';
    c.drawImage(blurred, ax, ay, aw, ah);
  } else {
    const noise = createSurface(aw, ah);
    const nc = ctxOf(noise, true);
    const img = nc.createImageData(aw, ah);
    const cell = Math.max(1, Math.round((s / 100) * base * 0.01));
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = (y * aw + x) * 4;
        const v = ((Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663)) & 255;
        const n = (Math.sin(v * 12.9898) * 43758.5453) % 1;
        const g = Math.abs(n) * 255;
        img.data[i] = g;
        img.data[i + 1] = g;
        img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    }
    nc.putImageData(img, 0, 0);
    c.drawImage(noise, ax, ay);
  }
  return out;
}

function censor(src: Surface, op: CensorOp): Surface {
  const out = createSurface(src.width, src.height);
  const c = ctxOf(out);
  c.drawImage(src, 0, 0);
  if (!op.regions.length) return out;
  const area = regionsBounds(op.regions, src.width, src.height);
  if (!area) return out;
  const effect = censorEffect(src, op, area, Math.min(src.width, src.height));
  const mask = createSurface(src.width, src.height);
  const mc = ctxOf(mask);
  mc.fillStyle = '#000';
  mc.strokeStyle = '#000';
  regionPath(mc, op.regions);
  const ec = ctxOf(effect);
  ec.globalCompositeOperation = 'destination-in';
  ec.drawImage(mask, 0, 0);
  c.drawImage(effect, 0, 0);
  return out;
}

async function maskOp(src: Surface, op: MaskOp): Promise<Surface> {
  const bmp = await createImageBitmap(op.mask);
  const m = createSurface(src.width, src.height);
  const mc = ctxOf(m, true);
  mc.imageSmoothingQuality = 'high';
  mc.drawImage(bmp, 0, 0, src.width, src.height);
  bmp.close();
  const base = Math.min(src.width, src.height);
  let maskSurface: Surface = m;
  if (op.feather > 0) maskSurface = blurSurface(m, (op.feather / 100) * base * 0.02);
  const md = readPixels(maskSurface);
  const t = op.threshold / 100;
  for (let i = 0; i < md.data.length; i += 4) {
    let a = md.data[i + 3] / 255;
    if (t > 0) a = a < t ? 0 : Math.min(1, (a - t) / Math.max(0.01, 1 - t) + t * 0.5);
    md.data[i] = 0;
    md.data[i + 1] = 0;
    md.data[i + 2] = 0;
    md.data[i + 3] = a * 255;
  }
  const alpha = createSurface(src.width, src.height);
  ctxOf(alpha).putImageData(md, 0, 0);

  const subject = createSurface(src.width, src.height);
  const sc = ctxOf(subject);
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = 'destination-in';
  sc.drawImage(alpha, 0, 0);

  let result = createSurface(src.width, src.height);
  const rc = ctxOf(result);
  if (op.bgType === 'color') {
    rc.fillStyle = op.bgColor;
    rc.fillRect(0, 0, result.width, result.height);
  } else if (op.bgType === 'blur') {
    rc.drawImage(blurSurface(src, Math.max(2, (op.blur / 100) * base * 0.05)), 0, 0);
  } else if (op.bgType === 'image' && op.bgImage) {
    const bg = await createImageBitmap(op.bgImage);
    const k = Math.max(result.width / bg.width, result.height / bg.height);
    rc.imageSmoothingQuality = 'high';
    rc.drawImage(bg, (result.width - bg.width * k) / 2, (result.height - bg.height * k) / 2, bg.width * k, bg.height * k);
    bg.close();
  }
  rc.drawImage(subject, 0, 0);
  if (op.trim) result = trim(result, { type: 'trim', tolerance: 2, padding: op.padding }, alpha);
  return result;
}

function trim(src: Surface, op: TrimOp, alphaSource?: Surface): Surface {
  const data = readPixels(alphaSource ?? src);
  const { width: w, height: h } = data;
  const d = data.data;
  const tol = (op.tolerance / 100) * 255;
  const useAlpha = alphaSource !== undefined || d[3] < 255 || d[(w * h - 1) * 4 + 3] < 255;
  const ref = [d[0], d[1], d[2], d[3]];
  const isBg = (i: number) =>
    useAlpha
      ? d[i + 3] <= tol
      : Math.abs(d[i] - ref[0]) <= tol && Math.abs(d[i + 1] - ref[1]) <= tol && Math.abs(d[i + 2] - ref[2]) <= tol;
  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  const rowEmpty = (y: number) => {
    for (let x = 0; x < w; x++) if (!isBg((y * w + x) * 4)) return false;
    return true;
  };
  const colEmpty = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) if (!isBg((y * w + x) * 4)) return false;
    return true;
  };
  while (top < h && rowEmpty(top)) top++;
  if (top >= h) return src;
  while (bottom > top && rowEmpty(bottom)) bottom--;
  while (left < w && colEmpty(left, top, bottom)) left++;
  while (right > left && colEmpty(right, top, bottom)) right--;
  const pad = Math.round((op.padding / 100) * Math.min(w, h));
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const out = createSurface(cw + pad * 2, ch + pad * 2);
  const c = ctxOf(out);
  if (!useAlpha) {
    c.fillStyle = `rgba(${ref[0]},${ref[1]},${ref[2]},${ref[3] / 255})`;
    c.fillRect(0, 0, out.width, out.height);
  }
  c.drawImage(src, left, top, cw, ch, pad, pad, cw, ch);
  return out;
}

async function overlay(src: Surface, layer: Blob): Promise<Surface> {
  const out = createSurface(src.width, src.height);
  const c = ctxOf(out);
  c.drawImage(src, 0, 0);
  const bmp = await createImageBitmap(layer);
  c.imageSmoothingQuality = 'high';
  c.drawImage(bmp, 0, 0, src.width, src.height);
  bmp.close();
  return out;
}

function scaleOp(op: Op, k: number): Op {
  if (k === 1) return op;
  switch (op.type) {
    case 'resize':
      if (op.mode === 'percent') return op;
      return { ...op, width: op.width && op.width * k, height: op.height && op.height * k, side: op.side && op.side * k };
    case 'crop':
      return op.unit === 'px' ? { ...op, x: op.x * k, y: op.y * k, w: op.w * k, h: op.h * k } : op;
    case 'censor':
      return {
        ...op,
        regions: op.regions.map((r) =>
          r.shape === 'stroke' ? { ...r, size: r.size * k, points: r.points.map((p) => p * k) } : { ...r, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k },
        ),
      };
    default:
      return op;
  }
}

export async function applyOp(s: Surface, op: Op, scale = 1, vars?: Record<string, string>): Promise<Surface> {
  op = scaleOp(op, scale);
  switch (op.type) {
    case 'resize':
      return resize(s, op);
    case 'crop':
      return crop(s, op);
    case 'aspectCrop':
      return aspectCrop(s, op);
    case 'rotate':
      return rotate(s, op);
    case 'flip':
      return flip(s, op);
    case 'adjust':
      return applyAdjust(s, op, scale);
    case 'watermark':
      return watermark(s, op, vars);
    case 'frame':
      return frame(s, op);
    case 'censor':
      return censor(s, op);
    case 'mask':
      return maskOp(s, op);
    case 'overlay':
      return overlay(s, op.layer);
    case 'trim':
      return trim(s, op);
  }
}
