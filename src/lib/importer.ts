import { engine } from '@/engine/client';
import { needsNormalize } from '@/engine/decode';
import { sniffMime } from '@/engine/formats';
import { useWorkspace, type Item } from '@/store/workspace';
import { toast, useUi } from '@/store/ui';
import { canvasLimits } from './device';
import { baseName, uid } from './format';

async function rasterizeSvg(file: Blob): Promise<Blob> {
  const text = await file.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    let w = img.naturalWidth || 1024;
    let h = img.naturalHeight || 1024;
    const vb = /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if ((!img.naturalWidth || !img.naturalHeight) && vb) {
      w = parseFloat(vb[1]);
      h = parseFloat(vb[2]);
    }
    const k = Math.max(1, 2048 / Math.max(w, h));
    const c = new OffscreenCanvas(Math.round(w * k), Math.round(h * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isAnimatedGif(buf: Uint8Array): boolean {
  let frames = 0;
  for (let i = 0; i < buf.length - 9; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04 && buf[i + 7] === 0x00 && (buf[i + 8] === 0x2c || buf[i + 8] === 0x21)) {
      if (++frames > 1) return true;
    }
  }
  return false;
}

function isAnimatedWebp(buf: Uint8Array): boolean {
  return String.fromCharCode(...buf.subarray(12, 16)) === 'VP8X' && (buf[20] & 0x02) !== 0;
}

async function pdfToImages(file: Blob, name: string): Promise<{ blob: Blob; name: string }[]> {
  const { renderPdf } = await import('./pdf');
  const pages = await renderPdf(file, { scale: 2, format: 'image/jpeg', quality: 0.92 });
  return pages.map((p, i) => ({ blob: p, name: `${name}-hal-${i + 1}` }));
}

async function toItem(blob: Blob, name: string, originalMime?: string): Promise<{ item: Item; notes: string[] } | null> {
  const notes: string[] = [];
  let mime = originalMime ?? (await sniffMime(blob));
  let working: Blob = blob;
  if (mime === 'image/svg+xml') {
    working = await rasterizeSvg(blob);
    mime = 'image/svg+xml';
  }
  let info = await engine.thumbnail(working, 320).catch(() => null);
  const { maxArea, maxDim } = canvasLimits();
  const tooBig = info && (info.width * info.height > maxArea || Math.max(info.width, info.height) > maxDim);
  if (!info || tooBig || needsNormalize(mime)) {
    const norm = await engine.toPng(working).catch(() => null);
    if (!norm) return null;
    if (norm.downscaled && info) notes.push(`${name}: ${info.width}×${info.height} diperkecil ke ${norm.width}×${norm.height} (batas perangkat).`);
    working = norm.blob;
    info = await engine.thumbnail(working, 320).catch(() => null);
    if (!info) return null;
  }
  let animated = false;
  if (mime === 'image/gif' || mime === 'image/webp') {
    const buf = new Uint8Array(await blob.arrayBuffer());
    animated = mime === 'image/gif' ? isAnimatedGif(buf) : isAnimatedWebp(buf);
    if (animated) notes.push(`${name}: gambar animasi, hanya frame pertama yang diproses.`);
  }
  const id = uid();
  const item: Item = {
    id,
    name,
    source: blob,
    sourceMime: mime,
    cursor: 0,
    addedAt: Date.now(),
    animated,
    versions: [
      {
        id: uid(),
        blob: working,
        width: info.width,
        height: info.height,
        mime: working.type || info.mime,
        size: working.size,
        label: 'Asli',
        hasAlpha: info.hasAlpha,
        thumb: info.blob,
        createdAt: Date.now(),
      },
    ],
  };
  return { item, notes };
}

export async function importFiles(input: (File | Blob)[], opts: { silent?: boolean } = {}): Promise<Item[]> {
  const files = input.filter((f) => f.size > 0);
  if (!files.length) return [];
  const ui = useUi.getState();
  const taskId = files.length > 1 ? ui.startTask({ label: 'Mengimpor gambar', total: files.length }) : null;
  const added: { idx: number; sub: number; item: Item }[] = [];
  const notes: string[] = [];
  const failed: string[] = [];
  let done = 0;
  const queue = files.map((f, idx) => ({ f, idx }));
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const { f, idx } = queue.shift()!;
      const name = baseName((f as File).name || 'tempel');
      try {
        const mime = await sniffMime(f);
        if (mime === 'application/pdf') {
          const pages = await pdfToImages(f, name);
          for (let sub = 0; sub < pages.length; sub++) {
            const r = await toItem(pages[sub].blob, pages[sub].name, 'image/jpeg');
            if (r) added.push({ idx, sub, item: r.item });
          }
          notes.push(`${name}.pdf: ${pages.length} halaman diimpor sebagai gambar.`);
        } else if (!mime.startsWith('image/')) {
          failed.push((f as File).name || name);
        } else {
          const r = await toItem(f, name, mime);
          if (r) {
            added.push({ idx, sub: 0, item: r.item });
            notes.push(...r.notes);
          } else failed.push((f as File).name || name);
        }
      } catch {
        failed.push((f as File).name || name);
      }
      done++;
      if (taskId) ui.updateTask(taskId, { done });
    }
  });
  await Promise.all(workers);
  if (taskId) ui.endTask(taskId);
  const items = added.sort((a, b) => a.idx - b.idx || a.sub - b.sub).map((a) => a.item);
  useWorkspace.getState().add(items);
  if (failed.length) {
    toast({ kind: 'error', title: `${failed.length} file tidak bisa dibuka`, body: failed.slice(0, 3).join(', ') + (failed.length > 3 ? '…' : '') + '. Pastikan file berupa gambar yang tidak rusak.' });
  }
  if (notes.length) toast({ kind: 'warn', title: 'Catatan impor', body: notes.slice(0, 3).join(' '), duration: 6000 });
  else if (items.length && !opts.silent) toast({ kind: 'success', title: `${items.length} gambar ditambahkan` });
  return items;
}

export function pickFiles(opts: { multiple?: boolean; capture?: boolean; accept?: string } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept ?? 'image/*,.heic,.heif,.jxl,.tif,.tiff,.avif,.svg,.ico,.bmp,application/pdf';
    input.multiple = opts.multiple ?? true;
    if (opts.capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    input.click();
  });
}
