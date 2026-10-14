import type { FaceDetector } from '@mediapipe/tasks-vision';

let detector: Promise<FaceDetector> | null = null;

function getDetector() {
  if (!detector) {
    detector = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe');
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.45,
        minSuppressionThreshold: 0.3,
      });
    })();
    detector.catch(() => (detector = null));
  }
  return detector;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / Math.min(a.w * a.h, b.w * b.h);
}

export async function detectFaces(blob: Blob, opts: { expand?: number } = {}): Promise<Box[]> {
  const det = await getDetector();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width;
  const H = bmp.height;
  const found: Box[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const run = (sx: number, sy: number, sw: number, sh: number, size: number) => {
    const k = Math.min(1, size / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const res = det.detect(canvas);
    for (const d of res.detections) {
      const b = d.boundingBox;
      if (!b) continue;
      found.push({ x: sx + b.originX / k, y: sy + b.originY / k, w: b.width / k, h: b.height / k, score: d.categories[0]?.score ?? 0.5 });
    }
  };

  run(0, 0, W, H, 1024);
  // The short-range model misses small faces in group shots, so overlapping tiles get a second pass.
  const long = Math.max(W, H);
  for (const grid of long > 1600 ? [2, 3] : long > 900 ? [2] : []) {
    const tw = W / grid;
    const th = H / grid;
    const ox = tw * 0.25;
    const oy = th * 0.25;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const sx = Math.max(0, gx * tw - ox);
        const sy = Math.max(0, gy * th - oy);
        run(sx, sy, Math.min(W - sx, tw + ox * 2), Math.min(H - sy, th + oy * 2), 768);
      }
    }
  }
  bmp.close();
  canvas.width = canvas.height = 0;

  found.sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const b of found) if (!kept.some((k) => iou(k, b) > 0.35)) kept.push(b);
  const e = opts.expand ?? 0.18;
  return kept.map((b) => {
    const dx = b.w * e;
    const dyTop = b.h * (e + 0.12);
    const dyBottom = b.h * e;
    const x = Math.max(0, b.x - dx);
    const y = Math.max(0, b.y - dyTop);
    return { x, y, w: Math.min(W - x, b.w + dx * 2), h: Math.min(H - y, b.h + dyTop + dyBottom), score: b.score };
  });
}
