import { sniffMime } from '@/engine/formats';

export interface MetaSummary {
  camera?: string;
  lens?: string;
  taken?: string;
  exposure?: string;
  aperture?: string;
  iso?: number;
  focal?: string;
  software?: string;
  gps?: { lat: number; lon: number; alt?: number };
  author?: string;
  copyright?: string;
  orientation?: number;
  colorSpace?: string;
  raw: Record<string, unknown>;
}

export async function readMeta(blob: Blob): Promise<MetaSummary | null> {
  const exifr = (await import('exifr')).default;
  let raw: Record<string, unknown> | undefined;
  try {
    raw = await exifr.parse(blob, { tiff: true, exif: true, gps: true, xmp: true, icc: true, iptc: true, jfif: true, ihdr: true, mergeOutput: true, translateValues: true, reviveValues: true });
  } catch {
    raw = undefined;
  }
  if (!raw || !Object.keys(raw).length) return null;
  const n = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const s = (v: unknown) => (v == null ? undefined : String(v));
  const date = raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate;
  const exp = n(raw.ExposureTime);
  const lat = n(raw.latitude);
  const lon = n(raw.longitude);
  return {
    camera: [s(raw.Make), s(raw.Model)].filter(Boolean).join(' ') || undefined,
    lens: s(raw.LensModel),
    taken: date instanceof Date ? date.toLocaleString('id-ID') : s(date),
    exposure: exp ? (exp >= 1 ? `${exp}s` : `1/${Math.round(1 / exp)}s`) : undefined,
    aperture: n(raw.FNumber) ? `f/${n(raw.FNumber)}` : undefined,
    iso: n(raw.ISO),
    focal: n(raw.FocalLength) ? `${n(raw.FocalLength)} mm` : undefined,
    software: s(raw.Software),
    gps: lat != null && lon != null ? { lat, lon, alt: n(raw.GPSAltitude) } : undefined,
    author: s(raw.Artist ?? raw.creator ?? raw.Creator),
    copyright: s(raw.Copyright ?? raw.rights),
    orientation: n(raw.Orientation),
    colorSpace: s(raw.ColorSpace ?? raw.ColorSpaceData ?? raw.ProfileDescription),
    raw,
  };
}

function stripJpeg(buf: Uint8Array, keepIcc: boolean): Uint8Array {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Bukan JPEG');
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xda) {
      parts.push(buf.subarray(i));
      break;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const seg = buf.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isIcc = marker === 0xe2 && String.fromCharCode(...seg.subarray(4, 15)) === 'ICC_PROFILE';
    const drop = (isApp && !(keepIcc && isIcc)) || marker === 0xfe;
    if (!drop) parts.push(seg);
    i += 2 + len;
  }
  return concat(parts);
}

function stripPng(buf: Uint8Array, keepIcc: boolean): Uint8Array {
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 8;
  const drop = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
  while (i + 8 <= buf.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(...buf.subarray(i + 4, i + 8));
    const total = 12 + len;
    if (!(drop.has(type) || (!keepIcc && type === 'iCCP'))) parts.push(buf.subarray(i, i + total));
    i += total;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

function stripWebp(buf: Uint8Array, keepIcc: boolean): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunks: Uint8Array[] = [];
  let i = 12;
  let vp8x: Uint8Array | null = null;
  while (i + 8 <= buf.length) {
    const fourcc = String.fromCharCode(...buf.subarray(i, i + 4));
    const size = dv.getUint32(i + 4, true);
    const total = 8 + size + (size & 1);
    const chunk = buf.slice(i, i + total);
    if (fourcc === 'VP8X') vp8x = chunk;
    else if (!(fourcc === 'EXIF' || fourcc === 'XMP ' || (!keepIcc && fourcc === 'ICCP'))) chunks.push(chunk);
    i += total;
  }
  if (vp8x) {
    vp8x[8] &= ~(0x08 | 0x04 | (keepIcc ? 0 : 0x20));
    chunks.unshift(vp8x);
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(buf.subarray(0, 4));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(buf.subarray(8, 12), 8);
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function stripLossless(blob: Blob, keepIcc = true): Promise<Blob | null> {
  const mime = await sniffMime(blob);
  const buf = new Uint8Array(await blob.arrayBuffer());
  try {
    if (mime === 'image/jpeg') return new Blob([stripJpeg(buf, keepIcc) as Uint8Array<ArrayBuffer>], { type: mime });
    if (mime === 'image/png') return new Blob([stripPng(buf, keepIcc) as Uint8Array<ArrayBuffer>], { type: mime });
    if (mime === 'image/webp') return new Blob([stripWebp(buf, keepIcc) as Uint8Array<ArrayBuffer>], { type: mime });
  } catch {
    return null;
  }
  return null;
}

function findApp1Exif(buf: Uint8Array): Uint8Array | null {
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) return null;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker === 0xe1 && String.fromCharCode(...buf.subarray(i + 4, i + 8)) === 'Exif') return buf.slice(i, i + 2 + len);
    i += 2 + len;
  }
  return null;
}

function resetOrientation(app1: Uint8Array) {
  const tiff = 10;
  const dv = new DataView(app1.buffer, app1.byteOffset, app1.byteLength);
  const le = dv.getUint16(tiff) === 0x4949;
  const ifd0 = tiff + dv.getUint32(tiff + 4, le);
  if (ifd0 + 2 > app1.length) return;
  const count = dv.getUint16(ifd0, le);
  for (let k = 0; k < count; k++) {
    const e = ifd0 + 2 + k * 12;
    if (e + 12 > app1.length) return;
    if (dv.getUint16(e, le) === 0x0112) {
      dv.setUint16(e + 8, 1, le);
      return;
    }
  }
}

export async function copyExif(source: Blob, target: Blob): Promise<Blob> {
  if ((await sniffMime(source)) !== 'image/jpeg' || (await sniffMime(target)) !== 'image/jpeg') return target;
  const app1 = findApp1Exif(new Uint8Array(await source.arrayBuffer()));
  if (!app1) return target;
  resetOrientation(app1);
  const t = stripJpeg(new Uint8Array(await target.arrayBuffer()), true);
  return new Blob([concat([t.subarray(0, 2), app1, t.subarray(2)]) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
}
