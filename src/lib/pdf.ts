import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

export async function pdfPageCount(file: Blob): Promise<number> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = doc.numPages;
  await doc.loadingTask.destroy();
  return n;
}

export interface RenderOptions {
  scale: number;
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
  pages?: number[];
  background?: string;
  onPage?: (done: number, total: number) => void;
  signal?: AbortSignal;
  maxArea?: number;
}

export async function renderPdf(file: Blob, o: RenderOptions): Promise<Blob[]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = o.pages?.length ? o.pages : Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const out: Blob[] = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      if (o.signal?.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      const page = await doc.getPage(pages[i]);
      let viewport = page.getViewport({ scale: o.scale });
      const max = o.maxArea ?? 40_000_000;
      if (viewport.width * viewport.height > max) viewport = page.getViewport({ scale: o.scale * Math.sqrt(max / (viewport.width * viewport.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d')!;
      if (o.format !== 'image/png' || o.background) {
        ctx.fillStyle = o.background ?? '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
      out.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Gagal render halaman'))), o.format, o.quality)));
      canvas.width = canvas.height = 0;
      page.cleanup();
      o.onPage?.(i + 1, pages.length);
    }
  } finally {
    await doc.loadingTask.destroy();
  }
  return out;
}

export interface PdfOptions {
  pageSize: 'fit' | 'a4' | 'letter' | 'legal' | 'a3' | 'a5' | 'f4';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: number;
  fit: 'contain' | 'cover' | 'stretch';
  background: string;
  title: string;
}

const SIZES_MM: Record<string, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  a3: [297, 420],
  a5: [148, 210],
  f4: [215, 330],
};

const mm = (v: number) => (v / 25.4) * 72;

export async function makePdf(images: { blob: Blob; width: number; height: number }[], o: PdfOptions, onProgress?: (n: number) => void): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(o.title || 'Dokumen');
  doc.setProducer('Racik');
  doc.setCreator('Racik');
  const hex = o.background.replace('#', '');
  const bg = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  for (let i = 0; i < images.length; i++) {
    const im = images[i];
    const bytes = new Uint8Array(await im.blob.arrayBuffer());
    const embedded = im.blob.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    let pw: number;
    let ph: number;
    const margin = mm(o.margin);
    if (o.pageSize === 'fit') {
      pw = im.width * 0.75 + margin * 2;
      ph = im.height * 0.75 + margin * 2;
    } else {
      const [a, b] = SIZES_MM[o.pageSize];
      const landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && im.width > im.height);
      pw = mm(landscape ? b : a);
      ph = mm(landscape ? a : b);
    }
    const page = doc.addPage([pw, ph]);
    page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: bg });
    const bw = pw - margin * 2;
    const bh = ph - margin * 2;
    let w = bw;
    let h = bh;
    if (o.fit !== 'stretch') {
      const k = o.fit === 'contain' ? Math.min(bw / im.width, bh / im.height) : Math.max(bw / im.width, bh / im.height);
      w = im.width * k;
      h = im.height * k;
    }
    page.drawImage(embedded, { x: margin + (bw - w) / 2, y: margin + (bh - h) / 2, width: w, height: h });
    onProgress?.(i + 1);
  }
  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
