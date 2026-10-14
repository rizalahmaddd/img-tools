import type { Format } from './types';

export interface FormatInfo {
  id: Format;
  label: string;
  mime: string;
  ext: string;
  alpha: boolean;
  lossy: boolean;
  lossless: boolean;
  note?: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'jpeg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg', alpha: false, lossy: true, lossless: false, note: 'Foto, paling kompatibel' },
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png', alpha: true, lossy: false, lossless: true, note: 'Transparan, grafis, teks' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true, lossy: true, lossless: true, note: 'Kecil untuk web' },
  { id: 'avif', label: 'AVIF', mime: 'image/avif', ext: 'avif', alpha: true, lossy: true, lossless: true, note: 'Paling kecil, encode lambat' },
  { id: 'jxl', label: 'JXL', mime: 'image/jxl', ext: 'jxl', alpha: true, lossy: true, lossless: true, note: 'Belum didukung semua browser' },
  { id: 'gif', label: 'GIF', mime: 'image/gif', ext: 'gif', alpha: true, lossy: false, lossless: false, note: 'Maks 256 warna' },
  { id: 'bmp', label: 'BMP', mime: 'image/bmp', ext: 'bmp', alpha: false, lossy: false, lossless: true, note: 'Tanpa kompresi' },
  { id: 'tiff', label: 'TIFF', mime: 'image/tiff', ext: 'tiff', alpha: true, lossy: false, lossless: true, note: 'Cetak & arsip' },
  { id: 'ico', label: 'ICO', mime: 'image/x-icon', ext: 'ico', alpha: true, lossy: false, lossless: true, note: 'Favicon Windows' },
];

export const formatById = (id: Format) => FORMATS.find((f) => f.id === id)!;

export function formatFromMime(mime: string): Format | null {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg';
  if (m === 'image/vnd.microsoft.icon') return 'ico';
  const f = FORMATS.find((x) => x.mime === m);
  return f ? f.id : null;
}

export function extFromMime(mime: string): string {
  const f = formatFromMime(mime);
  if (f) return formatById(f).ext;
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/zip') return 'zip';
  return mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
}

export function mimeLabel(mime: string): string {
  const f = formatFromMime(mime);
  if (f) return formatById(f).label;
  if (mime.includes('heic') || mime.includes('heif')) return 'HEIC';
  if (mime.includes('svg')) return 'SVG';
  return mime.replace('image/', '').toUpperCase();
}

export async function sniffMime(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const ascii = (from: number, len: number) => String.fromCharCode(...head.slice(from, from + len));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp';
  if (head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return 'image/x-icon';
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 0x2a)) return 'image/tiff';
  if ((head[0] === 0xff && head[1] === 0x0a) || ascii(4, 4) === 'JXL ') return 'image/jxl';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(4, 4) === 'ftyp') {
    const boxSize = (head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3];
    const brands: string[] = [ascii(8, 4)];
    for (let i = 16; i + 4 <= Math.min(boxSize, 64); i += 4) brands.push(ascii(i, 4));
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'image/avif';
    if (brands.some((b) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(b))) return 'image/heic';
  }
  const text = new TextDecoder().decode(head).trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && (await blob.slice(0, 2048).text()).includes('<svg'))) return 'image/svg+xml';
  return blob.type || 'application/octet-stream';
}

export const ACCEPT = 'image/*,.heic,.heif,.jxl,.tif,.tiff,.avif,.svg,.ico,.bmp';
