import { zip as zipAsync, type Zippable } from 'fflate';
import { canPickDirectory, canShareFiles, isIOS } from './device';
import { uniqueNames } from './format';

export interface OutFile {
  name: string;
  blob: Blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function makeZip(files: OutFile[]): Promise<Blob> {
  const names = uniqueNames(files.map((f) => f.name));
  const entries: Zippable = {};
  for (let i = 0; i < files.length; i++) {
    const data = new Uint8Array(await files[i].blob.arrayBuffer());
    entries[names[i]] = [data, { level: 0 }];
  }
  return new Promise((resolve, reject) => {
    zipAsync(entries, (err, out) => (err ? reject(err) : resolve(new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))));
  });
}

export async function downloadMany(files: OutFile[], zipName = 'racik.zip', asZip = true) {
  if (!files.length) return;
  if (files.length === 1) return downloadBlob(files[0].blob, files[0].name);
  if (asZip) return downloadBlob(await makeZip(files), zipName);
  const names = uniqueNames(files.map((f) => f.name));
  for (let i = 0; i < files.length; i++) {
    downloadBlob(files[i].blob, names[i]);
    // Browsers drop rapid-fire downloads, so they're spaced out.
    await new Promise((r) => setTimeout(r, isIOS() ? 900 : 250));
  }
}

export function toFiles(files: OutFile[]): File[] {
  const names = uniqueNames(files.map((f) => f.name));
  return files.map((f, i) => new File([f.blob], names[i], { type: f.blob.type }));
}

export const canShare = (files: OutFile[]) => canShareFiles(toFiles(files.slice(0, 1)));

export async function shareFiles(files: OutFile[], title?: string): Promise<boolean> {
  const list = toFiles(files);
  if (!canShareFiles(list)) return false;
  try {
    await navigator.share({ files: list, title });
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return true;
    throw e;
  }
}

type DirHandle = {
  getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;
};

export async function saveToFolder(files: OutFile[]): Promise<number> {
  if (!canPickDirectory()) throw new Error('Browser ini tidak mendukung simpan ke folder');
  const dir = (await (window as unknown as { showDirectoryPicker(o?: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' })) as DirHandle;
  const names = uniqueNames(files.map((f) => f.name));
  let n = 0;
  for (let i = 0; i < files.length; i++) {
    const fh = await dir.getFileHandle(names[i], { create: true });
    const w = await fh.createWritable();
    await w.write(files[i].blob);
    await w.close();
    n++;
  }
  return n;
}

export async function copyImage(blob: Blob): Promise<void> {
  let png = blob;
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    png = await c.convertToBlob({ type: 'image/png' });
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
