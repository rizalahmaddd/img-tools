export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

export const isAndroid = () => /Android/i.test(navigator.userAgent);

export const isTouch = () => matchMedia('(pointer: coarse)').matches;

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

let limits: { maxArea: number; maxDim: number } | null = null;

export function canvasLimits() {
  if (limits) return limits;
  // iOS Safari silently produces a blank canvas past ~16.7 MP, so the cap has to be applied up front.
  if (isIOS()) limits = { maxArea: 16_777_216, maxDim: 8192 };
  else {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    limits = { maxArea: mem <= 2 ? 40_000_000 : mem <= 4 ? 80_000_000 : 150_000_000, maxDim: 16384 };
  }
  return limits;
}

export function haptic(kind: 'light' | 'medium' | 'success' | 'error' = 'light') {
  try {
    const pattern = kind === 'light' ? 8 : kind === 'medium' ? 15 : kind === 'success' ? [10, 40, 10] : [30, 50, 30];
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export const canShareFiles = (files: File[]) => {
  try {
    return !!navigator.canShare?.({ files });
  } catch {
    return false;
  }
};

export const canPickDirectory = () => 'showDirectoryPicker' in window;

export const supportsClipboardWrite = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
