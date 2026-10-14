/// <reference types="vite/client" />

declare module 'gifenc' {
  type Palette = number[][];
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string; oneBitAlpha?: boolean | number }): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
}
