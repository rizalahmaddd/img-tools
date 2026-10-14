export type Format = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl' | 'gif' | 'bmp' | 'tiff' | 'ico';
export type OutputFormat = Format | 'auto' | 'original';

export interface OutputSpec {
  format: OutputFormat;
  quality: number;
  targetKB?: number | null;
  allowDownscale?: boolean;
  background: string;
  pngColors: number;
  pngDither: boolean;
  pngOptimize: number;
  jpegProgressive: boolean;
  jpegChroma: '420' | '444';
  lossless: boolean;
  effort: number;
  icoSizes: number[];
}

export const defaultOutput: OutputSpec = {
  format: 'auto',
  quality: 82,
  targetKB: null,
  allowDownscale: false,
  background: '#ffffff',
  pngColors: 0,
  pngDither: true,
  pngOptimize: -1,
  jpegProgressive: true,
  jpegChroma: '420',
  lossless: false,
  effort: 4,
  icoSizes: [16, 32, 48, 256],
};

export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export type ResizeFilter = 'mks2013' | 'lanczos3' | 'lanczos2' | 'hamming' | 'box';

export interface ResizeOp {
  type: 'resize';
  mode: 'exact' | 'contain' | 'cover' | 'percent' | 'long' | 'short' | 'width' | 'height';
  width?: number;
  height?: number;
  percent?: number;
  side?: number;
  enlarge: boolean;
  filter: ResizeFilter;
  background?: string;
  anchor?: Anchor;
}

export interface CropOp {
  type: 'crop';
  unit: 'px' | 'fraction';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AspectCropOp {
  type: 'aspectCrop';
  ratio: number;
  anchor: Anchor;
}

export interface RotateOp {
  type: 'rotate';
  angle: number;
  background: string;
  fill?: boolean;
}

export interface FlipOp {
  type: 'flip';
  h: boolean;
  v: boolean;
}

export interface AdjustParams {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  hue: number;
  grayscale: number;
  sepia: number;
  invert: boolean;
  fade: number;
  sharpen: number;
  blur: number;
  vignette: number;
  grain: number;
}

export interface AdjustOp extends Partial<AdjustParams> {
  type: 'adjust';
}

export interface WatermarkOp {
  type: 'watermark';
  kind: 'text' | 'image';
  text: string;
  font: string;
  bold: boolean;
  italic: boolean;
  color: string;
  size: number;
  opacity: number;
  rotation: number;
  position: Anchor | 'tile';
  margin: number;
  gap: number;
  outline: number;
  outlineColor: string;
  shadow: boolean;
  box: boolean;
  boxColor: string;
  image?: Blob | null;
  vars?: Record<string, string>;
}

export interface FrameOp {
  type: 'frame';
  padding: number;
  aspect: number;
  bgType: 'color' | 'blur' | 'transparent' | 'gradient';
  bgColor: string;
  bgColor2: string;
  blur: number;
  radius: number;
  border: number;
  borderColor: string;
  shadow: number;
}

export type CensorShape =
  | { shape: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }
  | { shape: 'stroke'; points: number[]; size: number };

export interface CensorOp {
  type: 'censor';
  regions: CensorShape[];
  mode: 'blur' | 'pixelate' | 'solid' | 'noise';
  strength: number;
  color: string;
}

export interface MaskOp {
  type: 'mask';
  mask: Blob;
  feather: number;
  threshold: number;
  bgType: 'transparent' | 'color' | 'blur' | 'image';
  bgColor: string;
  bgImage?: Blob | null;
  blur: number;
  trim: boolean;
  padding: number;
}

export interface OverlayOp {
  type: 'overlay';
  layer: Blob;
}

export interface TrimOp {
  type: 'trim';
  tolerance: number;
  padding: number;
}

export type Op =
  | ResizeOp
  | CropOp
  | AspectCropOp
  | RotateOp
  | FlipOp
  | AdjustOp
  | WatermarkOp
  | FrameOp
  | CensorOp
  | MaskOp
  | OverlayOp
  | TrimOp;

export interface Job {
  ops: Op[];
  output: OutputSpec;
  srcMime: string;
  maxArea: number;
  maxDim: number;
  previewMax?: number;
  vars?: Record<string, string>;
}

export interface JobResult {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  downscaled?: boolean;
  note?: string;
}

export interface ProbeResult {
  width: number;
  height: number;
  mime: string;
  hasAlpha: boolean;
}
