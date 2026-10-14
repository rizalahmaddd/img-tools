export type Device = 'webgpu' | 'wasm';

export interface SegModel {
  id: string;
  label: string;
  hint: string;
  repo: Record<Device, string>;
  dtype: Record<Device, string>;
  file?: Partial<Record<Device, string>>;
  sizeMB: Record<Device, number>;
  license: string;
  cpuOnly?: boolean;
}

export const SEG_MODELS: SegModel[] = [
  {
    id: 'modnet',
    label: 'Cepat',
    hint: 'Paling cocok untuk foto orang, potret, pas foto',
    repo: { webgpu: 'Xenova/modnet', wasm: 'Xenova/modnet' },
    dtype: { webgpu: 'fp32', wasm: 'fp32' },
    sizeMB: { webgpu: 26, wasm: 26 },
    license: 'MODNet · Apache-2.0',
    // ORT's WebGPU backend returns a corrupted matte for MODNet; on CPU it is correct and still takes ~1s.
    cpuOnly: true,
  },
  {
    id: 'birefnet',
    label: 'Akurat',
    hint: 'Semua objek: produk, hewan, kendaraan, rambut halus',
    // The upstream export dies on WebGPU (deformable conv + bad_alloc); this graph is patched to run there.
    // On CPU the 1024 graph runs out of memory, so the 512 export is used instead.
    repo: { webgpu: 'jiabins0303/birefnet-lite-1024-webgpu', wasm: 'studioludens/birefnet-lite-512' },
    dtype: { webgpu: 'fp32', wasm: 'fp32' },
    file: { webgpu: 'model_fp16' },
    sizeMB: { webgpu: 115, wasm: 192 },
    license: 'BiRefNet · MIT',
  },
];

export interface UpscaleModel {
  id: string;
  label: string;
  hint: string;
  url: string;
  type: 'float32' | 'float16';
  scale: number;
  sizeMB: number;
  tile: Record<Device, number>;
  license: string;
}

export const UPSCALE_MODELS: UpscaleModel[] = [
  {
    id: 'general',
    label: 'Cepat',
    hint: 'Foto umum, ringan, bisa dipakai offline',
    url: '/models/realesr-general-x4v3.onnx',
    type: 'float32',
    scale: 4,
    sizeMB: 4.9,
    tile: { webgpu: 256, wasm: 128 },
    license: 'Real-ESRGAN General v3 · BSD-3',
  },
  {
    id: 'x4plus',
    label: 'Detail tinggi',
    hint: 'Hasil paling tajam, butuh GPU, lebih lambat',
    url: 'https://huggingface.co/imgdesignart/realesrgan-x4-onnx/resolve/main/onnx/model_fp16.onnx',
    type: 'float16',
    scale: 4,
    sizeMB: 33.7,
    tile: { webgpu: 192, wasm: 64 },
    license: 'Real-ESRGAN x4plus · BSD-3',
  },
];

export const MODEL_CACHE = 'racik-models';
