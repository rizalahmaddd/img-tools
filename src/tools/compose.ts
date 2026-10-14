import { canvasLimits } from '@/lib/device';
import { fitArea } from '@/engine/canvas';
import { importFiles } from '@/lib/importer';
import { useWorkspace } from '@/store/workspace';

export interface Source {
  blob: Blob;
  width: number;
  height: number;
}

export async function loadBitmaps(list: Source[], maxSide = Infinity): Promise<ImageBitmap[]> {
  return Promise.all(
    list.map((s) => {
      const k = Math.min(1, maxSide / Math.max(s.width, s.height));
      return k < 1 ? createImageBitmap(s.blob, { resizeWidth: Math.max(1, Math.round(s.width * k)), resizeQuality: 'high' }) : createImageBitmap(s.blob);
    }),
  );
}

export async function canvasToBlob(c: OffscreenCanvas, type: 'image/png' | 'image/jpeg' | 'image/webp', quality = 0.92) {
  const b = await c.convertToBlob({ type, quality });
  return b;
}

export function clampCanvas(w: number, h: number) {
  const { maxArea, maxDim } = canvasLimits();
  return fitArea(w, h, maxArea, maxDim);
}

export async function addGenerated(files: { blob: Blob; name: string }[]) {
  const ext = (b: Blob) => b.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const added = await importFiles(
    files.map((f) => new File([f.blob], `${f.name}.${ext(f.blob)}`, { type: f.blob.type })),
    { silent: true },
  );
  if (added.length) {
    useWorkspace.getState().setSelected(added.map((a) => a.id));
    useWorkspace.getState().setActive(added[0].id);
  }
  return added;
}
