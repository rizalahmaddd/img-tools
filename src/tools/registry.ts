import type { ComponentType } from 'react';
import {
  ArrowsClockwiseIcon,
  ArrowsOutIcon,
  CodeIcon,
  CropIcon,
  EyeSlashIcon,
  FileImageIcon,
  FilePdfIcon,
  FrameCornersIcon,
  GifIcon,
  GridFourIcon,
  InfoIcon,
  MagicWandIcon,
  PaletteIcon,
  PencilSimpleIcon,
  SelectionBackgroundIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StampIcon,
  AppWindowIcon,
  FileArrowDownIcon,
  ArrowsInSimpleIcon,
  type Icon,
} from '@phosphor-icons/react';

export type GroupId = 'basic' | 'edit' | 'ai' | 'combine' | 'util';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'basic', label: 'Format & ukuran' },
  { id: 'edit', label: 'Edit' },
  { id: 'ai', label: 'AI di perangkat' },
  { id: 'combine', label: 'Gabung & pecah' },
  { id: 'util', label: 'Utilitas' },
];

export interface ToolMeta {
  id: string;
  name: string;
  desc: string;
  icon: Icon;
  group: GroupId;
  keywords: string;
  load: () => Promise<{ default: ComponentType }>;
  standalone?: boolean;
}

export const TOOLS: ToolMeta[] = [
  { id: 'compress', name: 'Kompres', desc: 'Perkecil ukuran file, bisa target KB', icon: ArrowsInSimpleIcon, group: 'basic', keywords: 'compress kecilkan ukuran kb mb optimize', load: () => import('./compress') },
  { id: 'convert', name: 'Ubah Format', desc: 'JPG, PNG, WebP, AVIF, HEIC, ICO, dll', icon: FileArrowDownIcon, group: 'basic', keywords: 'convert konversi format jpg png webp avif heic gif bmp tiff', load: () => import('./convert') },
  { id: 'resize', name: 'Ubah Ukuran', desc: 'Piksel, persen, cm, atau preset sosmed', icon: ArrowsOutIcon, group: 'basic', keywords: 'resize scale dimensi lebar tinggi instagram', load: () => import('./resize') },
  { id: 'crop', name: 'Potong & Putar', desc: 'Crop rasio, luruskan, putar, balik', icon: CropIcon, group: 'basic', keywords: 'crop potong rotate putar flip balik luruskan rasio', load: () => import('./crop') },
  { id: 'rotate', name: 'Putar Massal', desc: 'Putar & balik banyak gambar sekaligus', icon: ArrowsClockwiseIcon, group: 'basic', keywords: 'rotate putar flip mirror balik massal', load: () => import('./rotate') },
  { id: 'adjust', name: 'Warna & Filter', desc: 'Kecerahan, kontras, saturasi, preset', icon: SlidersHorizontalIcon, group: 'edit', keywords: 'filter adjust warna kontras brightness saturasi tajam blur', load: () => import('./adjust') },
  { id: 'watermark', name: 'Watermark', desc: 'Teks atau logo, posisi atau ubin', icon: StampIcon, group: 'edit', keywords: 'watermark logo teks copyright tanda air', load: () => import('./watermark') },
  { id: 'censor', name: 'Sensor', desc: 'Blur, pixel, atau tutup. Deteksi wajah', icon: EyeSlashIcon, group: 'edit', keywords: 'sensor blur pixelate sembunyikan wajah privasi redact', load: () => import('./censor') },
  { id: 'annotate', name: 'Teks & Coretan', desc: 'Tambah teks, panah, kotak, stabilo', icon: PencilSimpleIcon, group: 'edit', keywords: 'annotate tulis teks coret panah kotak markup meme', load: () => import('./annotate') },
  { id: 'frame', name: 'Bingkai & Kanvas', desc: 'Padding, sudut bulat, latar, rasio', icon: FrameCornersIcon, group: 'edit', keywords: 'border bingkai padding kanvas rounded latar shadow rasio', load: () => import('./frame') },
  { id: 'removebg', name: 'Hapus Latar', desc: 'Latar transparan atau ganti warna', icon: SelectionBackgroundIcon, group: 'ai', keywords: 'remove background hapus latar transparan png ai', load: () => import('./removebg') },
  { id: 'upscale', name: 'Perbesar HD', desc: 'Perbesar 2×–4× dengan AI', icon: MagicWandIcon, group: 'ai', keywords: 'upscale hd perbesar resolusi enhance ai jernih', load: () => import('./upscale') },
  { id: 'collage', name: 'Gabung & Kolase', desc: 'Sambung samping/atas atau grid', icon: SquaresFourIcon, group: 'combine', keywords: 'merge gabung kolase collage stitch sambung', load: () => import('./collage') },
  { id: 'split', name: 'Pecah Grid', desc: 'Potong jadi kotak-kotak atau carousel', icon: GridFourIcon, group: 'combine', keywords: 'split pecah grid carousel instagram slice', load: () => import('./split') },
  { id: 'topdf', name: 'Gambar ke PDF', desc: 'Satukan gambar jadi satu PDF', icon: FilePdfIcon, group: 'combine', keywords: 'pdf gabung dokumen scan a4', load: () => import('./topdf') },
  { id: 'frompdf', name: 'PDF ke Gambar', desc: 'Ambil tiap halaman jadi gambar', icon: FileImageIcon, group: 'combine', keywords: 'pdf gambar halaman ekstrak jpg png', load: () => import('./frompdf'), standalone: true },
  { id: 'gif', name: 'Buat GIF', desc: 'Animasi dari beberapa gambar', icon: GifIcon, group: 'combine', keywords: 'gif animasi animation frame', load: () => import('./gif') },
  { id: 'metadata', name: 'Info & EXIF', desc: 'Lihat & hapus metadata, lokasi GPS', icon: InfoIcon, group: 'util', keywords: 'exif metadata gps lokasi kamera info hapus privasi', load: () => import('./metadata') },
  { id: 'palette', name: 'Palet Warna', desc: 'Ambil warna dominan & pipet', icon: PaletteIcon, group: 'util', keywords: 'palette warna color picker pipet hex', load: () => import('./palette') },
  { id: 'icons', name: 'Ikon & Favicon', desc: 'Favicon, ikon app Android/iOS', icon: AppWindowIcon, group: 'util', keywords: 'favicon ico icon pwa android ios apple touch', load: () => import('./icons') },
  { id: 'base64', name: 'Base64', desc: 'Gambar ↔ Base64 / Data URL', icon: CodeIcon, group: 'util', keywords: 'base64 data url encode decode css html', load: () => import('./base64'), standalone: true },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

export function searchTools(q: string): ToolMeta[] {
  const s = q.trim().toLowerCase();
  if (!s) return TOOLS;
  return TOOLS.filter((t) => `${t.name} ${t.desc} ${t.keywords}`.toLowerCase().includes(s));
}
