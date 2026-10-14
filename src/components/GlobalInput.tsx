import { useEffect, useState } from 'react';
import { UploadSimpleIcon } from '@phosphor-icons/react';
import { importFiles } from '@/lib/importer';
import { toast } from '@/store/ui';
import { idb } from '@/store/persist';

export async function pasteFromClipboard() {
  try {
    if (!navigator.clipboard?.read) throw new Error('unsupported');
    const items = await navigator.clipboard.read();
    const blobs: Blob[] = [];
    for (const it of items) {
      const type = it.types.find((t) => t.startsWith('image/'));
      if (type) blobs.push(await it.getType(type));
    }
    if (!blobs.length) return toast({ kind: 'warn', title: 'Clipboard tidak berisi gambar' });
    await importFiles(blobs.map((b, i) => new File([b], `tempel-${i + 1}.${b.type.split('/')[1] ?? 'png'}`, { type: b.type })));
  } catch {
    toast({ title: 'Tekan Ctrl+V / ⌘V untuk menempel', body: 'Browser ini tidak mengizinkan membaca clipboard lewat tombol.' });
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const entries = Array.from(dt.items ?? [])
    .map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.())
    .filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return Array.from(dt.files);
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      const read = () => new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      for (let batch = await read(); batch.length; batch = await read()) for (const c of batch) await walk(c);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export function GlobalInput() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.('input,textarea,[contenteditable]')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
      if (files.length) {
        e.preventDefault();
        importFiles(files);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (/^data:image\/[a-z+.-]+;base64,/i.test(text.trim())) {
        e.preventDefault();
        fetch(text.trim())
          .then((r) => r.blob())
          .then((b) => importFiles([new File([b], 'tempel.' + (b.type.split('/')[1] ?? 'png'), { type: b.type })]));
      }
    };
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer) importFiles(await filesFromDrop(e.dataTransfer));
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files: { getFile(): Promise<File> }[] }) => void): void } }).launchQueue;
    lq?.setConsumer(async (params) => {
      if (!params.files?.length) return;
      importFiles(await Promise.all(params.files.map((h) => h.getFile())));
    });
    const url = new URL(location.href);
    if (url.searchParams.has('shared')) {
      idb.get<File[]>('shared-files').then((files) => {
        if (files?.length) importFiles(files);
        idb.del('shared-files');
      });
      url.searchParams.delete('shared');
      history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  if (!dragging) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border-2 border-dashed border-white/70 bg-surface/95 px-6 py-10 text-center shadow-[var(--shadow-pop)]">
        <UploadSimpleIcon size={36} className="text-accent" weight="bold" />
        <p className="text-base font-semibold">Lepas untuk menambahkan</p>
        <p className="text-sm text-muted">Gambar, folder, atau PDF</p>
      </div>
    </div>
  );
}
